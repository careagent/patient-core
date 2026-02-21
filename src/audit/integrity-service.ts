/**
 * Audit integrity background service -- periodically verifies the audit
 * hash chain has not been tampered with.
 *
 * Mirrors provider-core's integrity-service.ts. Stub for Phase 3.
 */

import type { ServiceConfig } from '../adapters/types.js';

/** Create an audit integrity background service (stub -- Phase 3). */
export function createAuditIntegrityService(): ServiceConfig {
  return {
    id: 'careagent-audit-integrity',
    start: () => {
      throw new Error('Audit integrity service not yet implemented (Phase 3)');
    },
    stop: () => {
      throw new Error('Audit integrity service not yet implemented (Phase 3)');
    },
  };
}
