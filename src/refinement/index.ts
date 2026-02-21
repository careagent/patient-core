/**
 * Refinement module -- public API re-exports.
 */

export type {
  Observation,
  Proposal,
  DivergencePattern,
  ObservationCategory,
  ProposalResolution,
} from './types.js';

export { createRefinementEngine } from './refinement-engine.js';
export type { RefinementEngine, RefinementEngineConfig } from './refinement-engine.js';
