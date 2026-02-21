/**
 * Clinical skill loader -- stub for Phase 7.
 *
 * Mirrors provider-core's loader.ts. Composes credential validation,
 * version pin enforcement, integrity verification, and manifest parsing
 * into a single loading pipeline.
 */

import type { SkillLoadResult } from './types.js';

/** Load all clinical skills from a base directory (stub -- Phase 7). */
export function loadClinicalSkills(
  _skillsBaseDir: string,
): SkillLoadResult[] {
  throw new Error('Skill loader not yet implemented (Phase 7)');
}
