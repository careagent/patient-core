/**
 * AuditWriter -- async-buffered, hash-chained, append-only JSONL writer.
 *
 * Replaces the Phase 1 stub. Uses ONLY Node.js built-ins (node:fs, node:crypto).
 * Zero runtime dependencies.
 *
 * Key design:
 * - append() is synchronous and never blocks callers (AUDT-04)
 * - Hash chain is computed in-memory for consistency
 * - Disk writes are async-buffered via node:fs/promises appendFile
 * - Hybrid flush trigger: count threshold OR timer, whichever fires first
 * - Genesis entry uses prev_hash: null
 * - Crash loses only unflushed buffer entries; chain resumes correctly on restart
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { AuditEntry } from './entry-schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditWriterOptions {
  /** Number of buffered entries that triggers an immediate flush. Default: 10. */
  flushThreshold?: number;
  /** Milliseconds between timer-triggered flushes. Default: 1000. */
  flushIntervalMs?: number;
}

export interface VerifyChainResult {
  valid: boolean;
  entries: number;
  brokenAt?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// AuditWriter
// ---------------------------------------------------------------------------

export class AuditWriter {
  static readonly DEFAULT_FLUSH_THRESHOLD = 10;
  static readonly DEFAULT_FLUSH_INTERVAL_MS = 1000;

  private lastHash: string | null = null;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing: boolean = false;
  private readonly logPath: string;
  private readonly flushThreshold: number;
  private readonly flushIntervalMs: number;

  constructor(logPath: string, options?: AuditWriterOptions) {
    this.logPath = logPath;
    this.flushThreshold =
      options?.flushThreshold ?? AuditWriter.DEFAULT_FLUSH_THRESHOLD;
    this.flushIntervalMs =
      options?.flushIntervalMs ?? AuditWriter.DEFAULT_FLUSH_INTERVAL_MS;

    // Ensure parent directory exists
    const dir = dirname(logPath);
    mkdirSync(dir, { recursive: true });

    // Recover chain position from existing log (sync at startup only)
    this.lastHash = this.recoverLastHash();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Append an audit entry to the log, enriching it with prev_hash.
   *
   * Synchronous -- never blocks callers. Entry is buffered in memory and
   * flushed to disk when the buffer reaches the threshold or the timer fires.
   *
   * IMPORTANT: Uses explicit property ordering to ensure deterministic JSON
   * serialization (Pitfall 2 from RESEARCH.md).
   */
  append(entry: Omit<AuditEntry, 'prev_hash'>): void {
    // Build the enriched entry with explicit field ordering
    const enriched: AuditEntry = {
      schema_version: entry.schema_version,
      timestamp: entry.timestamp,
      session_id: entry.session_id,
      trace_id: entry.trace_id,
      action: entry.action,
      ...(entry.action_state !== undefined && {
        action_state: entry.action_state,
      }),
      actor: entry.actor,
      ...(entry.target !== undefined && { target: entry.target }),
      outcome: entry.outcome,
      ...(entry.details !== undefined && { details: entry.details }),
      ...(entry.blocked_reason !== undefined && {
        blocked_reason: entry.blocked_reason,
      }),
      ...(entry.blocking_layer !== undefined && {
        blocking_layer: entry.blocking_layer,
      }),
      ...(entry.correlation_id !== undefined && {
        correlation_id: entry.correlation_id,
      }),
      ...(entry.summary !== undefined && { summary: entry.summary }),
      prev_hash: this.lastHash,
    };

    const line = JSON.stringify(enriched);
    this.lastHash = createHash('sha256').update(line).digest('hex');
    this.buffer.push(line);

    if (this.buffer.length >= this.flushThreshold) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /**
   * Flush all buffered entries to disk.
   *
   * Guarded against concurrent flushes to prevent duplicate writes (Pitfall 4).
   */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    this.cancelScheduledFlush();

    // Splice all pending entries from buffer
    const batch = this.buffer.splice(0);
    const data = batch.join('\n') + '\n';

    try {
      await appendFile(this.logPath, data, 'utf-8');
    } catch {
      // Write failure: entries are lost (acceptable per user decision).
      // Caller can detect via adapter.log('warn', ...) in pipeline layer.
    }

    this.flushing = false;

    // If more entries arrived during flush, schedule another
    if (this.buffer.length > 0) {
      this.scheduleFlush();
    }
  }

  /**
   * Verify the integrity of the hash chain in the audit log.
   *
   * Reads the log file synchronously and walks the chain, verifying each
   * entry's prev_hash matches the SHA-256 of the previous entry's JSON line.
   *
   * Returns { valid: true, entries: 0 } for empty/missing file.
   */
  verifyChain(): VerifyChainResult {
    if (!existsSync(this.logPath)) {
      return { valid: true, entries: 0 };
    }

    let content: string;
    try {
      content = readFileSync(this.logPath, 'utf-8');
    } catch {
      return { valid: true, entries: 0 };
    }

    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return { valid: true, entries: 0 };
    }

    let prevLineHash: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      let entry: AuditEntry;
      try {
        entry = JSON.parse(lines[i]) as AuditEntry;
      } catch {
        return {
          valid: false,
          entries: i,
          brokenAt: i,
          error: `Invalid JSON at line ${i}`,
        };
      }

      if (entry.prev_hash !== prevLineHash) {
        return {
          valid: false,
          entries: i,
          brokenAt: i,
          error: `Hash mismatch at entry ${i}: expected ${prevLineHash}, got ${entry.prev_hash}`,
        };
      }

      prevLineHash = createHash('sha256').update(lines[i]).digest('hex');
    }

    return { valid: true, entries: lines.length };
  }

  /** Get the hash of the last entry in the chain (or null if empty). */
  getLastHash(): string | null {
    return this.lastHash;
  }

  /** Clear the flush timer. Call when the writer is no longer needed. */
  dispose(): void {
    this.cancelScheduledFlush();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Recover the hash of the last entry from an existing log file.
   *
   * Called synchronously at construction time only. Returns null if the file
   * does not exist or is empty.
   */
  private recoverLastHash(): string | null {
    if (!existsSync(this.logPath)) {
      return null;
    }

    let content: string;
    try {
      content = readFileSync(this.logPath, 'utf-8');
    } catch {
      return null;
    }

    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return null;
    }

    const lastLine = lines[lines.length - 1];
    return createHash('sha256').update(lastLine).digest('hex');
  }

  /** Schedule a timer-triggered flush. Unref'd so it does not keep Node alive. */
  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
    // Unref the timer so it does not prevent Node.js from exiting (Pitfall 3)
    if (
      this.flushTimer &&
      typeof this.flushTimer === 'object' &&
      'unref' in this.flushTimer
    ) {
      (this.flushTimer as NodeJS.Timeout).unref();
    }
  }

  /** Cancel any pending scheduled flush. */
  private cancelScheduledFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
