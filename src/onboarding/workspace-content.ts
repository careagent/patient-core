/**
 * Workspace content generators -- stub for Phase 4.
 *
 * Mirrors provider-core's workspace-content.ts. Generates clinical content
 * for workspace files (SOUL.md, AGENTS.md, USER.md).
 */

import type { CANSDocument } from '../activation/cans-schema.js';

/** Generate SOUL.md content (stub -- Phase 4). */
export function generateSoulContent(_data: CANSDocument, _philosophy: string): string {
  throw new Error('SOUL.md content generation not yet implemented (Phase 4)');
}

/** Generate AGENTS.md content (stub -- Phase 4). */
export function generateAgentsContent(_data: CANSDocument): string {
  throw new Error('AGENTS.md content generation not yet implemented (Phase 4)');
}

/** Generate USER.md content (stub -- Phase 4). */
export function generateUserContent(_data: CANSDocument): string {
  throw new Error('USER.md content generation not yet implemented (Phase 4)');
}
