/**
 * Layer 1: Tool Policy Lockdown
 *
 * Pure, stateless function that checks whether a tool call is permitted
 * based on the CANS scope's permitted_actions (whitelist-only model).
 *
 * Evaluation order:
 * 1. If CANS has no scope/permitted_actions -> allow (not yet configured)
 * 2. If tool NOT in permitted_actions -> deny
 * 3. Otherwise -> allow
 *
 * Hardening is always on (deterministic, hardcoded in plugin).
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'tool-policy';

export function checkToolPolicy(
  event: ToolCallEvent,
  cans: CANSDocument,
): HardeningLayerResult {
  // Safely access scope.permitted_actions -- CANSDocument is a placeholder
  // in Phase 1; full schema arrives in Phase 2. Defensive access avoids
  // crashing on incomplete documents.
  const doc = cans as Record<string, unknown>;
  const scope = doc.scope as { permitted_actions?: string[] } | undefined;
  const permitted = scope?.permitted_actions;

  if (!permitted || !Array.isArray(permitted)) {
    // No tool policy configured -- allow by default
    return { layer: LAYER_NAME, allowed: true, reason: 'no tool policy configured' };
  }

  if (!permitted.includes(event.toolName)) {
    return {
      layer: LAYER_NAME,
      allowed: false,
      reason: `Tool '${event.toolName}' is not in permitted_actions`,
    };
  }

  return { layer: LAYER_NAME, allowed: true };
}
