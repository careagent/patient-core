/**
 * @careagent/patient-core -- Patient-facing clinical agent with consent engine and secure channel
 *
 * Default entry point re-exports the OpenClaw plugin registration.
 * OpenClaw discovers this via the `openclaw.extensions` field in package.json.
 *
 * For other entry points:
 *   - @careagent/patient-core/standalone -- activate() for non-OpenClaw environments
 *   - @careagent/patient-core/core -- pure type/class re-exports (no side effects)
 */

export { default } from './entry/openclaw.js';
