/**
 * Tests for discovery module Ed25519 cryptographic operations.
 */

import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  publicKeyToBase64Url,
  privateKeyToBase64Url,
  signPayload,
  verifySignature,
  importPublicKey,
  importPrivateKey,
  generateNonce,
} from '../../../src/discovery/crypto.js';

// ---------------------------------------------------------------------------
// Key format conversion
// ---------------------------------------------------------------------------

describe('publicKeyToBase64Url', () => {
  it('returns a 43-character base64url string (raw 32-byte Ed25519 key)', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const b64 = publicKeyToBase64Url(publicKey);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBe(43);
    // base64url alphabet only
    expect(/^[A-Za-z0-9_-]+$/.test(b64)).toBe(true);
  });
});

describe('privateKeyToBase64Url', () => {
  it('returns a 43-character base64url string', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const b64 = privateKeyToBase64Url(privateKey);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBe(43);
    expect(/^[A-Za-z0-9_-]+$/.test(b64)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Signing and verification
// ---------------------------------------------------------------------------

describe('signPayload / verifySignature', () => {
  it('round-trips: sign then verify succeeds', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const payload = JSON.stringify({ test: 'data', ts: Date.now() });

    const signature = signPayload(payload, privateKey);
    const pubB64 = publicKeyToBase64Url(publicKey);

    expect(verifySignature(payload, signature, pubB64)).toBe(true);
  });

  it('rejects tampered payload', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const payload = 'original';

    const signature = signPayload(payload, privateKey);
    const pubB64 = publicKeyToBase64Url(publicKey);

    expect(verifySignature('tampered', signature, pubB64)).toBe(false);
  });

  it('rejects wrong public key', () => {
    const kp1 = generateKeyPairSync('ed25519');
    const kp2 = generateKeyPairSync('ed25519');
    const payload = 'test';

    const signature = signPayload(payload, kp1.privateKey);
    const wrongPub = publicKeyToBase64Url(kp2.publicKey);

    expect(verifySignature(payload, signature, wrongPub)).toBe(false);
  });

  it('produces a 86-character base64url signature (64 bytes raw)', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const signature = signPayload('test', privateKey);
    expect(signature.length).toBe(86);
    expect(/^[A-Za-z0-9_-]+$/.test(signature)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Key import
// ---------------------------------------------------------------------------

describe('importPublicKey', () => {
  it('reconstructs a KeyObject from base64url JWK', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const b64 = publicKeyToBase64Url(publicKey);
    const imported = importPublicKey(b64);

    expect(imported.type).toBe('public');
    expect(imported.asymmetricKeyType).toBe('ed25519');
  });
});

describe('importPrivateKey', () => {
  it('reconstructs a private KeyObject from base64url JWK components', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pubB64 = publicKeyToBase64Url(publicKey);
    const privB64 = privateKeyToBase64Url(privateKey);

    const imported = importPrivateKey(privB64, pubB64);
    expect(imported.type).toBe('private');
    expect(imported.asymmetricKeyType).toBe('ed25519');

    // Verify the imported key can sign
    const sig = signPayload('test', imported);
    expect(verifySignature('test', sig, pubB64)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Nonce generation
// ---------------------------------------------------------------------------

describe('generateNonce', () => {
  it('returns a base64url string', () => {
    const nonce = generateNonce();
    expect(typeof nonce).toBe('string');
    expect(/^[A-Za-z0-9_-]+$/.test(nonce)).toBe(true);
  });

  it('default is 22 characters (16 bytes base64url)', () => {
    const nonce = generateNonce();
    expect(nonce.length).toBe(22);
  });

  it('respects custom byte count', () => {
    const nonce = generateNonce(32);
    expect(nonce.length).toBe(43); // 32 bytes -> 43 base64url chars
  });

  it('generates unique nonces', () => {
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(nonces.size).toBe(100);
  });
});
