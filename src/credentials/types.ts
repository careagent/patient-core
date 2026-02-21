/**
 * Credential validator types -- interfaces for patient credential verification.
 *
 * Mirrors provider-core's credential types, adapted for patient context.
 * Phase 4 will implement the full validator.
 */

import type { CANSDocument } from '../activation/cans-schema.js';

/** Result from a credential validation check. */
export interface CredentialCheckResult {
  valid: boolean;
  identity: string;
  reason?: string;
}

/**
 * The credential validator -- checks patient identity against requirements.
 */
export interface CredentialValidator {
  /** Validate patient credentials against required criteria. */
  check(
    cans: CANSDocument,
    requiredCredentials: Record<string, unknown>,
  ): CredentialCheckResult;
}
