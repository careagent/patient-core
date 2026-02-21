/**
 * Review flow -- stub for Phase 4.
 *
 * Mirrors provider-core's review.ts. Handles the review loop
 * (generation, preview, editing, final write of CANS.md).
 */

import type { InterviewIO } from '../cli/io.js';
import type { InterviewResult } from './engine.js';
import type { AuditPipeline } from '../audit/pipeline.js';

/** Run the CANS.md review loop (stub -- Phase 4). */
export async function reviewLoop(
  _io: InterviewIO,
  _result: InterviewResult,
  _workspacePath: string,
  _audit: AuditPipeline,
): Promise<void> {
  throw new Error('Review loop not yet implemented (Phase 4)');
}
