/**
 * Credential validator factory -- stub for Phase 4.
 *
 * Mirrors provider-core's validator.ts.
 */

import type { CredentialValidator } from './types.js';

/** Create a credential validator instance (stub -- Phase 4). */
export function createCredentialValidator(): CredentialValidator {
  return {
    check(_cans, _requiredCredentials) {
      throw new Error('Credential validator not yet implemented (Phase 4)');
    },
  };
}
