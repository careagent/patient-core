/**
 * Interview stages -- stub for Phase 4.
 *
 * Mirrors provider-core's stages.ts. Defines the patient onboarding
 * interview stages (health history, preferences, consent, etc.).
 */

export interface InterviewStage {
  id: string;
  name: string;
  description: string;
}

/** Patient onboarding interview stages (stub -- Phase 4). */
export function getInterviewStages(): InterviewStage[] {
  throw new Error('Interview stages not yet implemented (Phase 4)');
}
