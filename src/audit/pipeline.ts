/**
 * AuditPipeline -- high-level audit logging API with session and trace management.
 *
 * Mirrors provider-core's pipeline.ts. All entries are written to
 * `.careagent/AUDIT.log` via AuditWriter.
 *
 * Features:
 * - Session management: every entry gets a consistent session_id
 * - Entry enrichment: schema_version, timestamp, trace_id auto-added
 * - Bilateral correlation: createCorrelationId() and correlation_id passthrough
 * - Flush passthrough: flush() delegates to writer for persistence guarantees
 * - Chain verification passthrough: verifyChain() delegates to writer
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ActionStateType } from './entry-schema.js';
import type { AuditEntry } from './entry-schema.js';
import { AuditWriter, type VerifyChainResult } from './writer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogInput {
  action: string;
  actor?: 'agent' | 'patient' | 'provider' | 'system';
  target?: string;
  outcome: 'allowed' | 'denied' | 'escalated' | 'error' | 'active' | 'inactive';
  action_state?: ActionStateType;
  details?: Record<string, unknown>;
  blocked_reason?: string;
  blocking_layer?: string;
  trace_id?: string;
  correlation_id?: string;
  summary?: string;
}

// ---------------------------------------------------------------------------
// AuditPipeline
// ---------------------------------------------------------------------------

export class AuditPipeline {
  private readonly writer: AuditWriter;
  private readonly sessionId: string;

  constructor(workspacePath: string, sessionId?: string) {
    const auditDir = join(workspacePath, '.careagent');
    mkdirSync(auditDir, { recursive: true });

    const logPath = join(auditDir, 'AUDIT.log');
    this.writer = new AuditWriter(logPath);
    this.sessionId = sessionId ?? randomUUID();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Log an audit entry.
   *
   * Enriches the input with schema_version, timestamp, session_id, and trace_id.
   * Uses explicit property ordering for deterministic JSON serialization.
   * Optional fields are conditionally spread to avoid undefined values in JSON.
   */
  log(input: AuditLogInput): void {
    const entry: Omit<AuditEntry, 'prev_hash'> = {
      schema_version: '1',
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      trace_id: input.trace_id ?? randomUUID(),
      action: input.action,
      ...(input.action_state !== undefined && {
        action_state: input.action_state,
      }),
      actor: input.actor ?? 'system',
      ...(input.target !== undefined && { target: input.target }),
      outcome: input.outcome,
      ...(input.details !== undefined && { details: input.details }),
      ...(input.blocked_reason !== undefined && {
        blocked_reason: input.blocked_reason,
      }),
      ...(input.blocking_layer !== undefined && {
        blocking_layer: input.blocking_layer,
      }),
      ...(input.correlation_id !== undefined && {
        correlation_id: input.correlation_id,
      }),
      ...(input.summary !== undefined && { summary: input.summary }),
    };

    this.writer.append(entry);
  }

  /**
   * Convenience method for logging blocked actions.
   *
   * Calls log() with outcome: 'denied' and actor: 'system'.
   */
  logBlocked(input: {
    action: string;
    target?: string;
    blocked_reason: string;
    blocking_layer: string;
    action_state?: ActionStateType;
    details?: Record<string, unknown>;
  }): void {
    this.log({
      action: input.action,
      outcome: 'denied',
      actor: 'system',
      ...(input.target !== undefined && { target: input.target }),
      blocked_reason: input.blocked_reason,
      blocking_layer: input.blocking_layer,
      ...(input.action_state !== undefined && {
        action_state: input.action_state,
      }),
      ...(input.details !== undefined && { details: input.details }),
    });
  }

  /** Flush all buffered entries to disk. Delegates to writer.flush(). */
  async flush(): Promise<void> {
    return this.writer.flush();
  }

  /** Verify the integrity of the audit hash chain. Delegates to writer.verifyChain(). */
  verifyChain(): VerifyChainResult {
    return this.writer.verifyChain();
  }

  /** Get the current session ID. */
  getSessionId(): string {
    return this.sessionId;
  }

  /** Create a new trace ID for correlating related audit events. */
  createTraceId(): string {
    return randomUUID();
  }

  /** Create a correlation ID for bilateral audit trail linking. */
  createCorrelationId(): string {
    return randomUUID();
  }

  /** Dispose of the writer and clear any timers. */
  dispose(): void {
    this.writer.dispose();
  }
}
