/**
 * Layer 6: Data Minimization (allow-all stub -- Phase 5)
 *
 * Patient-specific layer that will enforce data minimization on tool
 * call outputs. In Phase 5, this will redact or filter data that
 * exceeds the minimum necessary for the requested operation.
 *
 * Currently returns allow-all to avoid blocking the pipeline before
 * the consent engine is implemented.
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'data-minimization';

export function checkDataMinimization(
  _event: ToolCallEvent,
  _cans: CANSDocument,
): HardeningLayerResult {
  return {
    layer: LAYER_NAME,
    allowed: true,
    reason: 'stub -- data-minimization not yet implemented (Phase 5)',
  };
}
