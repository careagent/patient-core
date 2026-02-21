/**
 * Neuron client factory -- stub implementation for Phase 6+.
 *
 * All methods throw "not yet implemented" errors.
 */

import type { NeuronClient } from './types.js';

/** Create a Neuron client instance (stub -- Phase 6). */
export function createNeuronClient(): NeuronClient {
  return {
    async register(_config) {
      throw new Error('Neuron client not yet implemented (Phase 6)');
    },
    async heartbeat() {
      throw new Error('Neuron client not yet implemented (Phase 6)');
    },
    async disconnect() {
      throw new Error('Neuron client not yet implemented (Phase 6)');
    },
  };
}
