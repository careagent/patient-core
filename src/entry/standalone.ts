/**
 * Standalone entry point -- activates CareAgent without a host platform.
 *
 * Use this when running CareAgent as a library or CLI tool outside of
 * OpenClaw or any other host platform plugin system.
 *
 * Phase 1: Minimal placeholder. Plan 02 will wire the full activation flow.
 */

import { createStandaloneAdapter } from '../adapters/standalone/index.js';
import type { PlatformAdapter } from '../adapters/types.js';

export interface ActivateResult {
  adapter: PlatformAdapter;
}

/**
 * Activates CareAgent in standalone mode (Phase 1 placeholder).
 *
 * @param workspacePath - The workspace directory. Defaults to process.cwd().
 */
export function activate(workspacePath?: string): ActivateResult {
  const adapter = createStandaloneAdapter(workspacePath);
  adapter.log('info', '[CareAgent] Patient-core standalone activated (Phase 1 placeholder)');
  return { adapter };
}
