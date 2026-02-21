/**
 * ActivationGate -- 5-step pipeline checking whether the patient clinical
 * agent is active.
 *
 * Pipeline (short-circuits on first failure):
 *   1. Presence check: read CANS.md from workspace
 *   2. YAML parse: extract frontmatter
 *   3. identity_type discriminator: must be 'patient'
 *   4. SHA-256 integrity: sidecar hash verification
 *   5. TypeBox schema: full field validation
 *
 * All pass => { active: true, document: CANSDocument, reason: 'activated' }
 * Any fail => { active: false, document: null, reason: string }
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { parseCANS } from './cans-parser.js';
import { verifyIntegrity } from './cans-integrity.js';
import { CANSSchema, type CANSDocument } from './cans-schema.js';

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
   * Run the 5-step activation pipeline.
   * Returns a typed ActivationResult -- callers must await.
   */
  async check(): Promise<ActivationResult> {
    const cansPath = join(this._workspacePath, 'CANS.md');

    // Step 1: Presence check
    let content: string;
    try {
      content = await readFile(cansPath, 'utf8');
    } catch {
      // No CANS.md = silent standard operation (no audit, no mention of clinical mode)
      return { active: false, document: null, reason: 'no-cans' };
    }

    // Step 2: YAML parse
    const { frontmatter, error: parseError } = parseCANS(content);
    if (!frontmatter || parseError) {
      this._safeAudit({
        action: 'activation_check',
        outcome: 'error',
        details: { reason: parseError ?? 'invalid-frontmatter' },
      });
      return {
        active: false,
        document: null,
        reason: parseError ?? 'invalid-frontmatter',
      };
    }

    // Step 3: identity_type discriminator (before full schema validation)
    if (frontmatter.identity_type !== 'patient') {
      const msg = `CANS.md identity_type is "${frontmatter.identity_type}", expected "patient"`;
      return { active: false, document: null, reason: msg };
    }

    // Step 4: SHA-256 integrity check (BEFORE schema validation)
    const integrity = await verifyIntegrity(cansPath, content);
    if (!integrity.valid) {
      const msg =
        integrity.reason === 'no-sidecar'
          ? 'CANS.md has never been signed. Run patientagent resign to create integrity sidecar.'
          : 'CANS.md integrity check failed. Run patientagent resign to re-validate.';
      this._safeAudit({
        action: 'integrity_check',
        outcome: 'error',
        details: {
          reason: integrity.reason,
          computed:
            'computed' in integrity ? integrity.computed : undefined,
        },
      });
      return { active: false, document: null, reason: msg };
    }

    // Step 5: TypeBox schema validation
    if (!Value.Check(CANSSchema, frontmatter)) {
      const errors = [...Value.Errors(CANSSchema, frontmatter)].map(
        (e) => ({ path: e.path, message: e.message }),
      );
      const summary = `CANS.md has ${errors.length} validation error${errors.length === 1 ? '' : 's'}. Run patientagent validate for details.`;
      this._safeAudit({
        action: 'schema_validation',
        outcome: 'error',
        details: { errorCount: errors.length },
      });
      return { active: false, document: null, reason: summary, errors };
    }

    // All checks pass -- activate
    const document = frontmatter as CANSDocument;
    this._safeAudit({
      action: 'activation_check',
      outcome: 'active',
      details: { identity_type: 'patient' },
    });
    return { active: true, document, reason: 'activated' };
  }

  /**
   * Call the audit callback wrapped in try/catch.
   * AuditPipeline is still a Phase 3 stub that may throw.
   */
  private _safeAudit(entry: Record<string, unknown>): void {
    try {
      this._auditLog(entry);
    } catch {
      // Swallow audit errors -- pipeline may be a stub
    }
  }
}
