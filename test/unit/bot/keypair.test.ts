/**
 * Tests for Ed25519 keypair generation.
 */

import { describe, it, expect } from 'vitest';
import { generatePatientKeypair } from '../../../src/bot/keypair.js';

describe('generatePatientKeypair', () => {
  it('generates an Ed25519 keypair', () => {
    const keypair = generatePatientKeypair();

    expect(keypair.publicKeyBase64).toBeDefined();
    expect(typeof keypair.publicKeyBase64).toBe('string');
    expect(keypair.publicKeyBase64.length).toBeGreaterThan(0);
    expect(keypair.privateKey).toBeDefined();
    expect(keypair.publicKey).toBeDefined();
  });

  it('generates unique keypairs', () => {
    const kp1 = generatePatientKeypair();
    const kp2 = generatePatientKeypair();

    expect(kp1.publicKeyBase64).not.toBe(kp2.publicKeyBase64);
  });

  it('produces a valid base64-encoded SPKI DER public key', () => {
    const keypair = generatePatientKeypair();

    // Valid base64 should decode without error
    const decoded = Buffer.from(keypair.publicKeyBase64, 'base64');
    expect(decoded.length).toBeGreaterThan(0);

    // SPKI-encoded Ed25519 key has a fixed prefix and is 44 bytes total
    expect(decoded.length).toBe(44);
  });

  it('private key can sign and public key can verify', () => {
    const crypto = require('node:crypto');
    const keypair = generatePatientKeypair();

    // Ed25519 uses EdDSA -- pass null for algorithm
    const message = Buffer.from('test message');
    const signature = crypto.sign(null, message, keypair.privateKey);

    expect(crypto.verify(null, message, keypair.publicKey, signature)).toBe(true);
  });
});
