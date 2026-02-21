/**
 * Layer 2: Exec Allowlist
 *
 * Pure, stateless function that controls which shell binaries are permitted
 * when the agent executes Bash/exec tool calls.
 *
 * Evaluation order:
 * 1. If not a Bash/exec tool call -> pass-through (not an exec call)
 * 2. Extract first token from command
 * 3. If empty -> deny
 * 4. If token in BASE_ALLOWLIST -> allow
 * 5. Otherwise -> deny
 *
 * Hardening is always on (deterministic, hardcoded in plugin).
 * The allowlist is conservative: read-only utilities and git.
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'exec-allowlist';

/** Conservative base allowlist: read-only utilities + git. */
const ALLOWED_BINARIES = [
  'cat', 'ls', 'head', 'tail', 'wc', 'git', 'grep', 'find', 'echo', 'sort', 'uniq', 'diff',
];

const BASE_ALLOWLIST = new Set<string>([
  // Bare names
  ...ALLOWED_BINARIES,
  // /bin/ paths
  ...ALLOWED_BINARIES.map((b) => `/bin/${b}`),
  // /usr/bin/ paths
  ...ALLOWED_BINARIES.map((b) => `/usr/bin/${b}`),
]);

/** Tool names treated as exec calls. */
const EXEC_TOOL_NAMES = new Set(['Bash', 'exec']);

export function checkExecAllowlist(
  event: ToolCallEvent,
  _cans: CANSDocument,
): HardeningLayerResult {
  if (!EXEC_TOOL_NAMES.has(event.toolName)) {
    return { layer: LAYER_NAME, allowed: true, reason: 'not an exec call' };
  }

  const command = typeof event.params?.command === 'string'
    ? event.params.command.trim()
    : '';

  if (command.length === 0) {
    return {
      layer: LAYER_NAME,
      allowed: false,
      reason: 'empty exec command',
    };
  }

  const firstToken = command.split(/\s+/)[0];

  if (BASE_ALLOWLIST.has(firstToken)) {
    return { layer: LAYER_NAME, allowed: true };
  }

  return {
    layer: LAYER_NAME,
    allowed: false,
    reason: `Binary '${firstToken}' is not in the exec allowlist`,
  };
}
