/**
 * Layer 3: CANS Protocol Injection
 *
 * Extracts clinical hard rules from the CANS document and injects them
 * into the agent's system prompt via the bootstrap hook. The per-check
 * function is a non-blocking pass-through that reports injection status
 * for engine composition.
 *
 * Patient-core adaptation: uses typed CANSDocument fields for consent_posture,
 * providers, and autonomy. Phase 1 defensive casting removed in Phase 2.
 *
 * Hardening is always on (deterministic, hardcoded in plugin).
 */

import type { ToolCallEvent, BootstrapContext } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'cans-injection';

/**
 * Extract concise clinical protocol rules from CANS document.
 *
 * Output is kept under 500 tokens (~2000 characters) to avoid
 * consuming excessive context window in the agent's system prompt.
 *
 * Uses typed CANSDocument field access for consent_posture, providers,
 * and autonomy. Phase 1 defensive casting has been removed.
 */
export function extractProtocolRules(cans: CANSDocument): string {
  const lines: string[] = [];
  lines.push('# CareAgent Patient Protocol');
  lines.push('');

  // Patient identity
  lines.push(`Identity Type: ${cans.identity_type}`);

  // Consent posture
  lines.push(`Consent Posture: ${cans.consent_posture}`);
  lines.push('');

  // Provider trust summary
  if (cans.providers && cans.providers.length > 0) {
    const activeCount = cans.providers.filter(p => p.trust_level === 'active').length;
    lines.push(`Active Providers: ${activeCount}`);
    lines.push('');
  }

  // Autonomy tiers
  if (cans.autonomy) {
    lines.push(`Autonomy: share=${cans.autonomy.share}, request=${cans.autonomy.request}, review=${cans.autonomy.review}`);
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
