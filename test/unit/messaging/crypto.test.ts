/**
 * Tests for messaging cryptographic operations — Ed25519 signature verification
 * and AES-256-GCM encryption/decryption.
 */

import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import {
  canonicalizePayload,
  verifyMessageSignature,
  signAck,
  encryptPayload,
  decryptPayload,
  generateEncryptionKey,
} from '../../../src/messaging/crypto.js';
import { publicKeyToBase64Url } from '../../../src/discovery/crypto.js';

// ---------------------------------------------------------------------------
// Helper: sign a payload using provider-core's convention
// ---------------------------------------------------------------------------

function providerSign(payload: Record<string, unknown>, privateKeyB64Url: string): string {
  const PKCS8_ED25519_PREFIX = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const data = Buffer.from(canonical, 'utf-8');
  const privKeyBytes = Buffer.from(privateKeyB64Url, 'base64url');
  const derKey = Buffer.concat([PKCS8_ED25519_PREFIX, privKeyBytes]);
  const { createPrivateKey } = require('node:crypto');
  const keyObject = createPrivateKey({ key: derKey, format: 'der', type: 'pkcs8' });
  return sign(null, data, keyObject).toString('base64url');
}

function getProviderKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubB64 = publicKeyToBase64Url(publicKey);
  const jwk = privateKey.export({ format: 'jwk' }) as { d: string };
  return { publicKey, privateKey, pubB64, privB64: jwk.d };
}

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

describe('canonicalizePayload', () => {
  it('sorts top-level keys alphabetically', () => {
    const result = canonicalizePayload({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('produces deterministic output regardless of insertion order', () => {
    const a = canonicalizePayload({ foo: 'bar', baz: 42 });
    const b = canonicalizePayload({ baz: 42, foo: 'bar' });
    expect(a).toBe(b);
  });

  it('handles nested objects (shallow sort only)', () => {
    const result = canonicalizePayload({ b: { z: 1, a: 2 }, a: 'first' });
    // Shallow sort: top-level keys sorted, nested object keys NOT sorted
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed)[0]).toBe('a');
    expect(Object.keys(parsed)[1]).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// Ed25519 Signature Verification
// ---------------------------------------------------------------------------

describe('verifyMessageSignature', () => {
  it('verifies a valid signature from provider-core signing convention', () => {
    const keys = getProviderKeys();
    const payload = {
      type: 'clinical_summary',
      summary: 'Patient doing well',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    };

    const signature = providerSign(payload, keys.privB64);
    expect(verifyMessageSignature(payload, signature, keys.pubB64)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const keys = getProviderKeys();
    const payload = {
      type: 'clinical_summary',
      summary: 'Original summary',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    };

    const signature = providerSign(payload, keys.privB64);
    const tampered = { ...payload, summary: 'Tampered summary' };
    expect(verifyMessageSignature(tampered, signature, keys.pubB64)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const keys1 = getProviderKeys();
    const keys2 = getProviderKeys();
    const payload = {
      type: 'clinical_summary',
      summary: 'Test',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    };

    const signature = providerSign(payload, keys1.privB64);
    expect(verifyMessageSignature(payload, signature, keys2.pubB64)).toBe(false);
  });

  it('returns false for malformed signature', () => {
    const keys = getProviderKeys();
    const payload = { type: 'test', value: 'data' };
    expect(verifyMessageSignature(payload, 'not-a-valid-signature!!!', keys.pubB64)).toBe(false);
  });

  it('returns false for malformed public key', () => {
    const payload = { type: 'test', value: 'data' };
    expect(verifyMessageSignature(payload, 'signature', 'bad-key')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ack Signing
// ---------------------------------------------------------------------------

describe('signAck', () => {
  it('produces a base64url-encoded signature', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const sig = signAck('test payload', privateKey);
    expect(typeof sig).toBe('string');
    expect(/^[A-Za-z0-9_-]+$/.test(sig)).toBe(true);
    expect(sig.length).toBe(86); // 64 bytes -> 86 base64url chars
  });

  it('produces different signatures for different payloads', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const sig1 = signAck('payload 1', privateKey);
    const sig2 = signAck('payload 2', privateKey);
    expect(sig1).not.toBe(sig2);
  });
});

// ---------------------------------------------------------------------------
// AES-256-GCM Encryption
// ---------------------------------------------------------------------------

describe('encryptPayload / decryptPayload', () => {
  it('round-trips: encrypt then decrypt returns original plaintext', () => {
    const key = generateEncryptionKey();
    const plaintext = JSON.stringify({
      type: 'clinical_summary',
      summary: 'Patient visit summary with PHI data',
      provider_npi: '1234567890',
    });

    const encrypted = encryptPayload(plaintext, key);
    const decrypted = decryptPayload(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('ciphertext differs from plaintext', () => {
    const key = generateEncryptionKey();
    const plaintext = 'sensitive clinical data';
    const encrypted = encryptPayload(plaintext, key);
    const ciphertextBytes = Buffer.from(encrypted.ciphertext, 'base64');
    expect(ciphertextBytes.toString('utf-8')).not.toBe(plaintext);
  });

  it('produces base64-encoded ciphertext, IV, and auth tag', () => {
    const key = generateEncryptionKey();
    const encrypted = encryptPayload('test', key);

    expect(typeof encrypted.ciphertext).toBe('string');
    expect(typeof encrypted.iv).toBe('string');
    expect(typeof encrypted.auth_tag).toBe('string');

    // IV should be 12 bytes -> 16 base64 chars
    const ivBytes = Buffer.from(encrypted.iv, 'base64');
    expect(ivBytes.length).toBe(12);

    // Auth tag should be 16 bytes
    const tagBytes = Buffer.from(encrypted.auth_tag, 'base64');
    expect(tagBytes.length).toBe(16);
  });

  it('uses different IVs for each encryption', () => {
    const key = generateEncryptionKey();
    const enc1 = encryptPayload('same data', key);
    const enc2 = encryptPayload('same data', key);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it('decryption fails with wrong key', () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();
    const encrypted = encryptPayload('test', key1);
    expect(() => decryptPayload(encrypted, key2)).toThrow();
  });

  it('decryption fails with tampered ciphertext', () => {
    const key = generateEncryptionKey();
    const encrypted = encryptPayload('test', key);
    const tampered = { ...encrypted, ciphertext: Buffer.from('tampered').toString('base64') };
    expect(() => decryptPayload(tampered, key)).toThrow();
  });

  it('decryption fails with tampered auth tag', () => {
    const key = generateEncryptionKey();
    const encrypted = encryptPayload('test', key);
    const tampered = { ...encrypted, auth_tag: randomBytes(16).toString('base64') };
    expect(() => decryptPayload(tampered, key)).toThrow();
  });

  it('handles empty string', () => {
    const key = generateEncryptionKey();
    const encrypted = encryptPayload('', key);
    const decrypted = decryptPayload(encrypted, key);
    expect(decrypted).toBe('');
  });

  it('handles large payloads', () => {
    const key = generateEncryptionKey();
    const large = 'x'.repeat(100_000);
    const encrypted = encryptPayload(large, key);
    const decrypted = decryptPayload(encrypted, key);
    expect(decrypted).toBe(large);
  });
});

describe('generateEncryptionKey', () => {
  it('returns a 32-byte Buffer', () => {
    const key = generateEncryptionKey();
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateEncryptionKey().toString('hex')));
    expect(keys.size).toBe(50);
  });
});
