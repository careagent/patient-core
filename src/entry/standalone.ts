/**
 * Standalone entry point -- activates CareAgent without a host platform.
 *
 * Use this when running CareAgent as a library or CLI tool outside of
 * OpenClaw or any other host platform plugin system.
 *
 * Phase 1 wires: Adapter, Activation Gate, Audit Pipeline, Hardening Engine.
 * Phase 4 wires: Clinical Skills.
 * Phase 5 wires: Consent Engine, Refinement Engine.
 */

import { createStandaloneAdapter } from '../adapters/standalone/index.js';
import type { PlatformAdapter } from '../adapters/types.js';
import { ActivationGate, type ActivationResult } from '../activation/gate.js';
import { AuditPipeline } from '../audit/pipeline.js';
import { createHardeningEngine } from '../hardening/engine.js';
import type { HardeningEngine } from '../hardening/types.js';

export interface ActivateResult {
  adapter: PlatformAdapter;
  audit: AuditPipeline;
  gate: ActivationGate;
  activation: ActivationResult;
  engine?: HardeningEngine;
}

/**
 * Activates CareAgent in standalone mode.
 *
 * Creates a standalone adapter, starts the audit pipeline, and checks
 * the activation gate. Returns all constructed objects so the caller
 * can interact with CareAgent programmatically.
 *
 * @param workspacePath - The workspace directory. Defaults to process.cwd().
 */
export function activate(workspacePath?: string): ActivateResult {
  const adapter = createStandaloneAdapter(workspacePath);
  const resolvedPath = adapter.getWorkspacePath();

  const audit = new AuditPipeline(resolvedPath);

  const gate = new ActivationGate(resolvedPath, (entry) => {
    try {
      audit.log({
        action: entry.action as string,
        actor: 'system',
        outcome: (entry.outcome as 'error') || 'error',
        details: entry.details as Record<string, unknown> | undefined,
      });
    } catch {
      // Audit pipeline may be a stub -- swallow errors
    }
  });

  const activation = gate.check();

  if (activation.active && activation.document) {
    try {
      audit.log({
        action: 'activation_check',
        actor: 'system',
        outcome: 'active',
        details: { identity_type: activation.document.identity_type },
      });
    } catch {
      // Audit pipeline may be a stub -- swallow errors
    }

    // Activate hardening engine (hooks will no-op in standalone, but layers 1-4 still work)
    try {
      const engine = createHardeningEngine();
      engine.activate({ cans: activation.document, adapter, audit });
      return { adapter, audit, gate, activation, engine };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      adapter.log('warn', `[CareAgent] Hardening engine activation failed: ${msg}`);
    }
  } else {
    try {
      audit.log({
        action: 'activation_check',
        actor: 'system',
        outcome: 'inactive',
        details: { reason: activation.reason || 'No valid CANS.md' },
      });
    } catch {
      // Audit pipeline may be a stub -- swallow errors
    }
  }

  return { adapter, audit, gate, activation };
}
