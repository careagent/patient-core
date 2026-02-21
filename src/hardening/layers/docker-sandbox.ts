/**
 * Layer 4: Docker Sandbox Detection
 *
 * Detects whether the runtime is inside a Docker container by checking
 * multiple signals: /.dockerenv, /proc/1/cgroup, and CONTAINER env var.
 *
 * This layer is report-only: it NEVER blocks tool calls. It reports
 * sandbox status for audit logging and engine composition.
 *
 * Hardening is always on (deterministic, hardcoded in plugin).
 */

import { existsSync, readFileSync } from 'node:fs';
import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'docker-sandbox';

/** Result of Docker container detection. */
export interface DockerDetectionResult {
  inContainer: boolean;
  signals: string[];
}

/**
 * Detect whether the current runtime is inside a Docker container.
 *
 * Checks three independent signals:
 * 1. /.dockerenv file existence
 * 2. /proc/1/cgroup containing 'docker' or 'containerd' or 'lxc'
 * 3. CONTAINER environment variable
 *
 * Gracefully handles missing /proc (macOS, Windows) via try/catch.
 */
export function detectDocker(): DockerDetectionResult {
  const signals: string[] = [];

  // Signal 1: /.dockerenv file
  if (existsSync('/.dockerenv')) {
    signals.push('/.dockerenv exists');
  }

  // Signal 2: /proc/1/cgroup contains container reference
  try {
    const cgroup = readFileSync('/proc/1/cgroup', 'utf-8');
    if (/docker|containerd|lxc/i.test(cgroup)) {
      signals.push('/proc/1/cgroup contains container reference');
    }
  } catch {
    // /proc not available (macOS, Windows) -- not a signal
  }

  // Signal 3: CONTAINER environment variable
  if (process.env.CONTAINER) {
    signals.push('CONTAINER env var set');
  }

  return {
    inContainer: signals.length > 0,
    signals,
  };
}

/**
 * Per-call check function for engine composition.
 *
 * Layer 4 is report-only: it always returns allowed: true.
 * The reason describes current sandbox status for audit logging.
 */
export function checkDockerSandbox(
  _event: ToolCallEvent,
  _cans: CANSDocument,
): HardeningLayerResult {
  const detection = detectDocker();
  if (detection.inContainer) {
    return {
      layer: LAYER_NAME,
      allowed: true,
      reason: `sandbox active (${detection.signals.join(', ')})`,
    };
  }

  return {
    layer: LAYER_NAME,
    allowed: true,
    reason: 'no container detected -- running outside sandbox',
  };
}
