/**
 * ActivationGate -- checks whether the patient clinical agent is active.
 *
 * Mirrors provider-core's gate.ts. In Phase 1, the gate always returns
 * inactive because the CANS schema is not yet implemented.
 * Phase 2 will replace this with the full activation logic.
 */

import type { CANSDocument } from './cans-schema.js';

export interface ActivationResult {
  active: boolean;
  document: CANSDocument | null;
  reason?: string;
  errors?: Array<{ path: string; message: string }>;
}

export type AuditCallback = (entry: Record<string, unknown>) => void;

export class ActivationGate {
  private _workspacePath: string;
  private _auditLog: AuditCallback;

  constructor(workspacePath: string, auditLog: AuditCallback) {
    this._workspacePath = workspacePath;
    this._auditLog = auditLog;
  }

  /**
   * Check activation status.
   * Phase 1 stub: always returns inactive.
   */
  check(): ActivationResult {
    // Suppress unused variable warnings by referencing fields
    void this._workspacePath;
    void this._auditLog;

    return {
      active: false,
      document: null,
      reason: 'CANS schema not yet implemented (Phase 2)',
    };
  }
}
