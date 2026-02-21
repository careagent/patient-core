/**
 * Init command orchestrator -- stub for Phase 4.
 *
 * Wires together the onboarding interview, review loop, workspace supplementation,
 * and success summary for the `careagent init` CLI command.
 */

import type { InterviewIO } from './io.js';
import type { AuditPipeline } from '../audit/pipeline.js';

export async function runInitCommand(
  io: InterviewIO,
  _workspacePath: string,
  _audit: AuditPipeline,
): Promise<void> {
  io.display('[CareAgent] careagent init not yet implemented (Phase 4)');
}
