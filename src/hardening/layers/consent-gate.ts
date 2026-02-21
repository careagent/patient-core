/**
 * Layer 5: Consent Gate (allow-all stub -- Phase 5)
 *
 * Patient-specific layer that will enforce consent-based access control
 * on tool calls. In Phase 5, this will check whether the patient has
 * granted explicit consent for the type of data access being requested.
 *
 * Currently returns allow-all to avoid blocking the pipeline before
 * the consent engine is implemented.
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'consent-gate';

export function checkConsentGate(
  _event: ToolCallEvent,
  _cans: CANSDocument,
): HardeningLayerResult {
  return {
    layer: LAYER_NAME,
    allowed: true,
    reason: 'stub -- consent-gate not yet implemented (Phase 5)',
  };
}
