/**
 * AuditPipeline -- high-level audit logging API with session and trace management.
 *
 * Mirrors provider-core's pipeline.ts. Stub for Phase 3.
 * All entries are written to `.careagent/AUDIT.log` via AuditWriter.
 */

import type { ActionStateType } from './entry-schema.js';

export interface AuditLogInput {
  action: string;
  actor?: 'agent' | 'patient' | 'system';
  target?: string;
  outcome: 'allowed' | 'denied' | 'escalated' | 'error' | 'active' | 'inactive';
  action_state?: ActionStateType;
  details?: Record<string, unknown>;
  blocked_reason?: string;
  blocking_layer?: string;
  trace_id?: string;
}

export class AuditPipeline {
  private _workspacePath: string;

  constructor(workspacePath: string) {
    this._workspacePath = workspacePath;
  }

  /** Log an audit entry (stub -- Phase 3). */
  log(_input: AuditLogInput): void {
    void this._workspacePath;
    throw new Error('AuditPipeline.log not yet implemented (Phase 3)');
  }

  /** Convenience method for logging blocked actions (stub -- Phase 3). */
  logBlocked(_input: {
    action: string;
    target?: string;
    blocked_reason: string;
    blocking_layer: string;
    action_state?: ActionStateType;
    details?: Record<string, unknown>;
  }): void {
    throw new Error('AuditPipeline.logBlocked not yet implemented (Phase 3)');
  }

  /** Verify the integrity of the audit hash chain (stub -- Phase 3). */
  verifyChain(): { valid: boolean; entries: number; brokenAt?: number; error?: string } {
    throw new Error('AuditPipeline.verifyChain not yet implemented (Phase 3)');
  }

  /** Get the current session ID (stub -- Phase 3). */
  getSessionId(): string {
    throw new Error('AuditPipeline.getSessionId not yet implemented (Phase 3)');
  }

  /** Create a new trace ID for correlating related audit events (stub -- Phase 3). */
  createTraceId(): string {
    throw new Error('AuditPipeline.createTraceId not yet implemented (Phase 3)');
  }
}
