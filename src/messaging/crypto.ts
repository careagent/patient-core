/**
 * Messaging cryptographic operations — signature verification and
 * AES-256-GCM encryption for message storage at rest.
 *
 * Signature verification uses the same Ed25519 approach as discovery/crypto.ts
 * but adapted for provider-core's message signing convention (shallow key sort).
 *
 * Encryption uses AES-256-GCM with random IVs for at-rest storage in the
 * patient chart vault. Each message gets a unique IV.
 */

import {
  verify,
  sign,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';
import type { EncryptedPayload } from './schemas.js';

// ---------------------------------------------------------------------------
// Ed25519 Signature Verification (provider message verification)
// ---------------------------------------------------------------------------

/**
 * Canonicalize a payload object using provider-core's convention:
 * shallow top-level key sort with JSON.stringify replacer.
 */
export function canonicalizePayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

/**
 * Verify an Ed25519 signature over a canonicalized message payload.
 *
 * Provider-core signs the canonical JSON (shallow sorted keys) of the payload.
 * The public key is base64url-encoded raw 32-byte Ed25519 key.
 *
 * @param payload - The message payload object to verify
 * @param signature - base64url-encoded Ed25519 signature
 * @param publicKeyB64Url - base64url-encoded Ed25519 public key
 * @returns true if signature is valid
 */
export function verifyMessageSignature(
  payload: Record<string, unknown>,
  signature: string,
  publicKeyB64Url: string,
): boolean {
  try {
    const canonical = canonicalizePayload(payload);
    const data = Buffer.from(canonical, 'utf-8');
    const keyObject = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: publicKeyB64Url },
      format: 'jwk',
    });
    return verify(
      null,
      data,
      keyObject,
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

/**
 * Sign a string payload with the patient's Ed25519 private key.
 * Used for signing ack messages.
 *
 * @param payload - The string to sign
 * @param privateKey - Ed25519 private KeyObject
 * @returns base64url-encoded signature
 */
export function signAck(payload: string, privateKey: KeyObject): string {
  return sign(null, Buffer.from(payload), privateKey).toString('base64url');
}

// ---------------------------------------------------------------------------
// AES-256-GCM Encryption (at-rest storage)
// ---------------------------------------------------------------------------

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Generates a random 12-byte IV for each encryption operation.
 * Returns the ciphertext, IV, and authentication tag — all base64-encoded.
 *
 * @param plaintext - The data to encrypt
 * @param key - 32-byte AES key
 * @returns Encrypted payload with ciphertext, IV, and auth tag
 */
export function encryptPayload(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
  };
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 *
 * @param encrypted - The encrypted payload (ciphertext, IV, auth tag)
 * @param key - 32-byte AES key
 * @returns Decrypted plaintext string
 */
export function decryptPayload(encrypted: EncryptedPayload, key: Buffer): string {
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.auth_tag, 'base64');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

/**
 * Generate a random 32-byte AES-256 encryption key.
 */
export function generateEncryptionKey(): Buffer {
  return randomBytes(32);
}
