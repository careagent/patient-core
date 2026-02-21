/**
 * OpenClaw entry point -- plugin registration for the OpenClaw platform.
 *
 * OpenClaw discovers this via the `openclaw.extensions` field in package.json
 * and calls the default export with the plugin API.
 *
 * Phase 1 wires: Adapter, Activation Gate, Audit Pipeline, Hardening Engine.
 * Phase 4 wires: Clinical Skills.
 * Phase 5 wires: Consent Engine, Refinement Engine.
 *
 * Each major operation is wrapped in its own try/catch for graceful
 * degradation (PLUG-05). The plugin MUST NOT crash the host platform.
 */

import { createAdapter } from '../adapters/detect.js';
import { ActivationGate } from '../activation/gate.js';
import { AuditPipeline } from '../audit/pipeline.js';
import { registerCLI } from '../cli/commands.js';
import { createHardeningEngine } from '../hardening/engine.js';

export default function register(api: unknown): void {
  // Step 1: Create adapter (duck-type detect and create appropriate adapter)
  const adapter = createAdapter(api);

  let workspacePath: string;
  try {
    workspacePath = adapter.getWorkspacePath();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Failed to resolve workspace path: ${msg}`);
    workspacePath = process.cwd();
  }

  // Step 2: Start audit pipeline (always active, even without CANS.md)
  const audit = new AuditPipeline(workspacePath);

  // Step 3: Register CLI commands (always available -- needed before CANS.md exists)
  try {
    registerCLI(adapter, workspacePath, audit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] CLI registration failed: ${msg}`);
  }

  // Step 4: Check activation gate
  let gate: ActivationGate;
  try {
    gate = new ActivationGate(workspacePath, (entry) => {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Activation gate creation failed: ${msg}`);
    return;
  }

  const result = gate.check();

  // Step 5: If not active, log reason and return
  if (!result.active || !result.document) {
    try {
      audit.log({
        action: 'activation_check',
        actor: 'system',
        outcome: 'inactive',
        details: { reason: result.reason || 'No valid CANS.md' },
      });
    } catch {
      // Audit pipeline may be a stub -- swallow errors
    }
    adapter.log('info', `[CareAgent] Clinical mode inactive: ${result.reason || 'No CANS.md found'}`);
    return;
  }

  // Step 6: Clinical mode active -- wire hardening engine
  const cans = result.document;
  try {
    audit.log({
      action: 'activation_check',
      actor: 'system',
      outcome: 'active',
      details: { identity_type: cans.identity_type },
    });
  } catch {
    // Audit pipeline may be a stub -- swallow errors
  }
  adapter.log('info', `[CareAgent] Clinical mode ACTIVE`);

  // Step 7: Activate hardening engine (all 6 layers)
  try {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Hardening engine activation failed: ${msg}`);
  }

  // Step 8: Register background services (audit integrity, canary)
  // Audit integrity service is a stub (Phase 3) -- skip registration to avoid crash
  // Background services will be registered when their implementations are ready

  // Step 9: Load skills (Phase 7 -- not yet available)
  // Skills loading is deferred until Phase 7 implementation
}
