/**
 * TypeBox schema for skill-manifest.json validation -- stub for Phase 7.
 *
 * Mirrors provider-core's manifest-schema.ts.
 */

import { Type, type Static } from '@sinclair/typebox';
import type { SkillManifest } from './types.js';

export const SkillManifestSchema = Type.Object({
  skill_id: Type.String({ minLength: 1 }),
  version: Type.String({ pattern: '^\\d+\\.\\d+\\.\\d+$' }),
  requires: Type.Object({
    license: Type.Optional(Type.Array(Type.String())),
    specialty: Type.Optional(Type.Array(Type.String())),
    privilege: Type.Optional(Type.Array(Type.String())),
  }),
  files: Type.Record(Type.String(), Type.String()),
  pinned: Type.Boolean(),
  approved_version: Type.String(),
});

export type SkillManifestData = Static<typeof SkillManifestSchema>;

export type ManifestValidationResult =
  | { valid: true; manifest: SkillManifest }
  | { valid: false; errors: string[] };

/** Validate a skill manifest (stub -- Phase 7). */
export function validateManifest(_data: unknown): ManifestValidationResult {
  throw new Error('Skill manifest validation not yet implemented (Phase 7)');
}
