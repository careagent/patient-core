/**
 * Skills module -- public API re-exports for the clinical skill framework.
 */

// Types
export type {
  SkillManifest,
  SkillLoadResult,
} from './types.js';

// Manifest validation
export { SkillManifestSchema, validateManifest } from './manifest-schema.js';

// Integrity
export {
  computeSkillFileHash,
  computeSkillChecksums,
  verifySkillIntegrity,
} from './integrity.js';

// Version pinning
export { checkVersionPin, approveVersion } from './version-pin.js';

// Loader
export { loadClinicalSkills } from './loader.js';
