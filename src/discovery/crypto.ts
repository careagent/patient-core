/**
 * Ed25519 cryptographic operations for Axon protocol integration.
 *
 * Axon uses base64url-encoded raw 32-byte Ed25519 keys (JWK format).
 * patient-core's keypair.ts uses SPKI DER format for storage.
 * This module bridges the two formats and provides signing/verification.
 */

import {
  sign,
  verify,
  randomBytes,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';

/**
 * Extract the base64url-encoded raw 32-byte public key (JWK 'x' component)
 * from a KeyObject. This is the format Axon expects.
 */
export function publicKeyToBase64Url(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  return jwk.x;
}

/**
 * Extract the base64url-encoded raw 32-byte private key (JWK 'd' component)
 * from a KeyObject.
 */
export function privateKeyToBase64Url(privateKey: KeyObject): string {
  const jwk = privateKey.export({ format: 'jwk' }) as { d: string };
  return jwk.d;
}

/**
 * Sign a payload string with an Ed25519 private key.
 * Returns a base64url-encoded Ed25519 signature (86 characters, 64 bytes raw).
 *
 * @param payload - The exact string bytes to sign
 * @param privateKey - Ed25519 private KeyObject
 * @returns base64url-encoded signature
 */
export function signPayload(payload: string, privateKey: KeyObject): string {
  return sign(null, Buffer.from(payload), privateKey).toString('base64url');
}

/**
 * Verify an Ed25519 signature over a payload string.
 *
 * @param payload - The original signed string
 * @param signature - base64url-encoded Ed25519 signature
 * @param publicKeyB64Url - base64url-encoded raw 32-byte public key (JWK 'x')
 * @returns true if signature is valid
 */
export function verifySignature(
  payload: string,
  signature: string,
  publicKeyB64Url: string,
): boolean {
  const keyObject = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: publicKeyB64Url },
    format: 'jwk',
  });
  return verify(
    null,
    Buffer.from(payload),
    keyObject,
    Buffer.from(signature, 'base64url'),
  );
}

/**
 * Import a base64url-encoded raw 32-byte Ed25519 public key as a KeyObject.
 */
export function importPublicKey(publicKeyB64Url: string): KeyObject {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: publicKeyB64Url },
    format: 'jwk',
  });
}

/**
 * Reconstruct a private KeyObject from base64url-encoded JWK components.
 */
export function importPrivateKey(privateKeyB64Url: string, publicKeyB64Url: string): KeyObject {
  return createPrivateKey({
    key: { kty: 'OKP', crv: 'Ed25519', d: privateKeyB64Url, x: publicKeyB64Url },
    format: 'jwk',
  });
}

/**
 * Generate a cryptographically secure nonce as a base64url string.
 * Default 16 bytes (22 base64url characters), matching Axon's minimum.
 */
export function generateNonce(bytes?: number): string {
  return randomBytes(bytes ?? 16).toString('base64url');
}
