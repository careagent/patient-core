/**
 * Interview engine -- stub for Phase 4.
 *
 * Mirrors provider-core's engine.ts. Orchestrates the patient onboarding
 * interview through a series of stages.
 */

import type { InterviewIO } from '../cli/io.js';

export interface InterviewResult {
  data: Record<string, unknown>;
  philosophy: string;
}

/** Run the patient onboarding interview (stub -- Phase 4). */
export async function runInterview(_io: InterviewIO): Promise<InterviewResult> {
  throw new Error('Interview engine not yet implemented (Phase 4)');
}
