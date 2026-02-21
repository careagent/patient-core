/**
 * Layer 3: CANS Protocol Injection
 *
 * Extracts clinical hard rules from the CANS document and injects them
 * into the agent's system prompt via the bootstrap hook. The per-check
 * function is a non-blocking pass-through that reports injection status
 * for engine composition.
 *
 * Patient-core adaptation: uses patient identity fields instead of provider.
 * Full patient CANS schema arrives in Phase 2.
 *
 * Hardening is always on (deterministic, hardcoded in plugin).
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { BootstrapContext } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'cans-injection';

/**
 * Extract concise clinical protocol rules from CANS document.
 *
 * Output is kept under 500 tokens (~2000 characters) to avoid
 * consuming excessive context window in the agent's system prompt.
 *
 * Uses defensive access because CANSDocument is a placeholder in Phase 1.
 */
export function extractProtocolRules(cans: CANSDocument): string {
  const doc = cans as Record<string, unknown>;
  const lines: string[] = [];
  lines.push('# CareAgent Patient Protocol');
  lines.push('');

  // Patient identity -- Phase 2 will provide full patient identity fields
  if (doc.identity_type) {
    lines.push(`Identity Type: ${doc.identity_type}`);
  }
  lines.push('');

  // Scope boundaries (if defined)
  const scope = doc.scope as { permitted_actions?: string[] } | undefined;
  if (scope?.permitted_actions && Array.isArray(scope.permitted_actions)) {
    lines.push('## Scope Boundaries (HARD RULES)');
    lines.push(`Permitted: ${scope.permitted_actions.join(', ')}`);
    lines.push('');
  }

  lines.push('NEVER share patient data without explicit consent. If uncertain, ASK the patient.');
  return lines.join('\n');
}

/**
 * Inject clinical protocol rules into the agent's bootstrap context.
 *
 * Called during agent bootstrap. Writes protocol rules as
 * CAREAGENT_PROTOCOL.md so the agent has scope awareness from startup.
 */
export function injectProtocol(context: BootstrapContext, cans: CANSDocument): void {
  const rules = extractProtocolRules(cans);
  context.addFile('CAREAGENT_PROTOCOL.md', rules);
}

/**
 * Per-call check function for engine composition.
 *
 * Layer 3 never blocks tool calls -- it acts at bootstrap time.
 * This function reports that protocol injection is active.
 */
export function checkCansInjection(
  _event: ToolCallEvent,
  _cans: CANSDocument,
): HardeningLayerResult {
  return { layer: LAYER_NAME, allowed: true, reason: 'protocol injected at bootstrap' };
}
