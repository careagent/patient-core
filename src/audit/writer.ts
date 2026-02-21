/**
 * AuditWriter -- hash-chained, append-only JSONL writer.
 *
 * Mirrors provider-core's writer.ts. Stub for Phase 3.
 * Uses ONLY Node.js built-ins (node:fs, node:crypto). Zero dependencies.
 */

import type { AuditEntry } from './entry-schema.js';

export class AuditWriter {
  private _logPath: string;

  constructor(logPath: string) {
    this._logPath = logPath;
  }

  /** Append an audit entry to the log, enriching it with the hash chain. */
  append(_entry: Omit<AuditEntry, 'prev_hash'>): void {
    void this._logPath;
    throw new Error('AuditWriter not yet implemented (Phase 3)');
  }

  /** Verify the integrity of the hash chain in the audit log. */
  verifyChain(): { valid: boolean; entries: number; brokenAt?: number; error?: string } {
    void this._logPath;
    throw new Error('AuditWriter.verifyChain not yet implemented (Phase 3)');
  }

  /** Get the hash of the last entry in the chain (or null if empty). */
  getLastHash(): string | null {
    void this._logPath;
    throw new Error('AuditWriter.getLastHash not yet implemented (Phase 3)');
  }
}
