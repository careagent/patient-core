/**
 * Platform detection -- duck-types the API object to determine which
 * host platform CareAgent is running under.
 */

import { createOpenClawAdapter } from './openclaw/index.js';
import { createStandaloneAdapter } from './standalone/index.js';
import type { PlatformAdapter } from './types.js';

/** Supported platform identifiers. */
export type DetectedPlatform = 'openclaw' | 'standalone';

/**
 * Detects the host platform by duck-typing the provided API object.
 *
 * OpenClaw APIs expose `registerCli` and `on` methods. If both are present
 * as functions, the platform is identified as OpenClaw. Otherwise, the
 * standalone adapter is used.
 */
export function detectPlatform(api: unknown): DetectedPlatform {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = api as any;
  if (
    typeof raw?.registerCli === 'function' &&
    typeof raw?.on === 'function'
  ) {
    return 'openclaw';
  }
  return 'standalone';
}

/**
 * Creates the appropriate PlatformAdapter based on duck-type detection.
 *
 * @param api - The API object passed to the plugin's register() function.
 */
export function createAdapter(api: unknown): PlatformAdapter {
  const platform = detectPlatform(api);
  if (platform === 'openclaw') {
    return createOpenClawAdapter(api);
  }
  return createStandaloneAdapter();
}
