/**
 * Protocol server factory -- stub implementation for Phase 6.
 *
 * All methods throw "not yet implemented" errors. Phase 6 will replace
 * this with the full cross-installation protocol server.
 */

import type { ProtocolServer } from './types.js';

/** Create a protocol server instance (stub -- Phase 6). */
export function createProtocolServer(): ProtocolServer {
  return {
    async start(_port) {
      throw new Error('Protocol server not yet implemented (Phase 6)');
    },
    async stop() {
      throw new Error('Protocol server not yet implemented (Phase 6)');
    },
    activeSessions() {
      throw new Error('Protocol server not yet implemented (Phase 6)');
    },
  };
}
