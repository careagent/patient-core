/**
 * Skill framework types -- plain TypeScript interfaces for the skill system.
 *
 * Mirrors provider-core's skill types. These interfaces are used throughout
 * the skill loader, integrity checker, and manifest validation.
 */

export interface SkillManifest {
  skill_id: string;
  version: string;
  requires: {
    license?: string[];
    specialty?: string[];
    privilege?: string[];
  };
  files: Record<string, string>; // filename -> sha256 hex hash
  pinned: boolean;
  approved_version: string;
}

export interface SkillLoadResult {
  skillId: string;
  loaded: boolean;
  reason?: string; // present when loaded=false
  version?: string; // present when loaded=true
  directory?: string; // present when loaded=true
}
