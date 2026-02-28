/**
 * Ed25519 keypair generation for patient identity.
 *
 * Uses Node.js built-in crypto module. The public key is exported as
 * base64-encoded DER (SPKI) for interoperability with the chart vault.
 */

import { generateKeyPairSync, type KeyObject } from 'node:crypto';

export interface PatientKeypair {
  /** Base64-encoded DER (SPKI) public key. */
  publicKeyBase64: string;
  /** The raw KeyObject for signing operations. */
  privateKey: KeyObject;
  /** The raw KeyObject for verification. */
  publicKey: KeyObject;
}

/**
 * Generate a new Ed25519 keypair for a patient.
 *
 * Returns the public key as base64-encoded SPKI DER, suitable for
 * storage in the chart vault and CANS.md.
 */
export function generatePatientKeypair(): PatientKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyBase64 = Buffer.from(publicKeyDer).toString('base64');

  return {
    publicKeyBase64,
    privateKey,
    publicKey,
  };
}
