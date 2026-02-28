/**
 * Layer 5: Consent Gate
 *
 * Patient-specific hardening layer that enforces consent-based access control
 * on tool calls. Maps tool call events to consent actions and delegates to
 * the consent engine for the actual decision.
 *
 * The consent engine must be attached via attachConsentEngine() before
 * this layer will enforce consent. If no engine is attached, the layer
 * allows all actions (graceful degradation for environments where the
 * consent engine has not been initialized).
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';
import type { ConsentEngine } from '../../consent/engine.js';
import type { ConsentAction } from '../../consent/schemas.js';

const LAYER_NAME = 'consent-gate';

// ---------------------------------------------------------------------------
// Module-level consent engine reference
// ---------------------------------------------------------------------------

let consentEngine: ConsentEngine | null = null;

/**
 * Attach a consent engine instance to the consent-gate layer.
 *
 * Must be called after the consent engine is created and before
 * the hardening pipeline processes tool calls.
 */
export function attachConsentEngine(engine: ConsentEngine): void {
  consentEngine = engine;
}

/**
 * Detach the consent engine from the consent-gate layer.
 *
 * Primarily used for testing to reset module state.
 */
export function detachConsentEngine(): void {
  consentEngine = null;
}

// ---------------------------------------------------------------------------
// Tool name to consent action mapping
// ---------------------------------------------------------------------------

/**
 * Map a tool call event to a consent action.
 *
 * Tool names are mapped to the most restrictive applicable consent action.
 * Unknown tools default to 'data:read' (read access requires consent too).
 */
export function mapToolToAction(event: ToolCallEvent): ConsentAction {
  const tool = event.toolName.toLowerCase();

  // Write operations
  if (tool === 'write' || tool === 'edit' || tool === 'notebookedit') {
    return 'data:write';
  }

  // Execution / shell
  if (tool === 'bash' || tool === 'exec') {
    // Shell commands that modify state are writes
    return 'data:write';
  }

  // Messaging
  if (tool === 'sendmessage' || tool === 'broadcast') {
    return 'message:send';
  }

  // Read operations (default for unknown tools)
  return 'data:read';
}

// ---------------------------------------------------------------------------
// Layer check function
// ---------------------------------------------------------------------------

/**
 * Check consent for a tool call event.
 *
 * If no consent engine is attached, allows all actions (graceful degradation).
 * Otherwise, maps the tool call to a consent action and checks the engine.
 */
export function checkConsentGate(
  event: ToolCallEvent,
  _cans: CANSDocument,
): HardeningLayerResult {
  // Graceful degradation: if no engine attached, allow all
  if (!consentEngine) {
    return {
      layer: LAYER_NAME,
      allowed: true,
      reason: 'consent engine not attached (graceful degradation)',
    };
  }

  const action = mapToolToAction(event);

  // Determine the actor: use the session key if available, otherwise 'unknown'
  const actorId = event.sessionKey ?? 'unknown';

  const decision = consentEngine.check({
    action,
    actorId,
  });

  return {
    layer: LAYER_NAME,
    allowed: decision.allowed,
    reason: decision.reason,
  };
}
