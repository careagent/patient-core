/**
 * Audit integrity background service -- periodically verifies the audit
 * hash chain has not been tampered with (DFNS-04).
 *
 * Mirrors provider-core's integrity-service.ts. Runs a startup check
 * followed by periodic checks every 60 seconds.
 *
 * Key design:
 * - Calls flush() before verifyChain() to ensure all buffered entries are on disk
 * - On chain break: logs error and continues (does NOT quarantine or restart chain)
 * - On valid chain at startup: logs info with entry count
 * - On valid chain periodic: silent (quiet success)
 * - Interval timer is unref'd to prevent Node.js process from hanging
 * - Stop is idempotent (safe to call multiple times)
 */

import type { ServiceConfig } from '../adapters/types.js';
import type { AuditPipeline } from './pipeline.js';

const CHECK_INTERVAL_MS = 60_000;

/** Create an audit integrity background service. */
export function createAuditIntegrityService(
  audit: AuditPipeline,
  adapter: { log(level: 'info' | 'warn' | 'error', message: string): void },
): ServiceConfig {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  async function runCheck(isStartup: boolean): Promise<void> {
    await audit.flush();
    const result = audit.verifyChain();

    if (!result.valid) {
      adapter.log(
        'error',
        `[CareAgent] Audit chain integrity break at entry ${result.brokenAt}: ${result.error}`,
      );
      return;
    }

    // Only log on startup (quiet success for periodic checks)
    if (isStartup) {
      adapter.log(
        'info',
        `[CareAgent] Audit chain integrity verified: ${result.entries} entries`,
      );
    }
  }

  return {
    id: 'careagent-audit-integrity',

    async start(): Promise<void> {
      // Run initial verification at startup
      await runCheck(true);

      // Set up periodic verification every 60 seconds
      intervalId = setInterval(() => {
        void runCheck(false);
      }, CHECK_INTERVAL_MS);

      // Unref the timer so it does not prevent Node.js from exiting
      if (
        intervalId &&
        typeof intervalId === 'object' &&
        'unref' in intervalId
      ) {
        (intervalId as NodeJS.Timeout).unref();
      }
    },

    stop(): void {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
