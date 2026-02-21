/**
 * OpenClaw entry point -- plugin registration for the OpenClaw platform.
 *
 * OpenClaw discovers this via the `openclaw.extensions` field in package.json
 * and calls the default export with the plugin API.
 *
 * Phase 1: Minimal placeholder that creates an adapter and logs inactive.
 * Plan 02 will replace this with the full registration flow.
 */

import { createAdapter } from '../adapters/detect.js';

export default function register(api: unknown): void {
  const adapter = createAdapter(api);
  adapter.log('info', '[CareAgent] Patient-core registered (Phase 1 placeholder)');
}
