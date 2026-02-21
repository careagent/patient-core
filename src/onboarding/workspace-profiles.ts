/**
 * Workspace profiles -- define which files each platform supplements
 * during onboarding.
 *
 * Mirrors provider-core's workspace-profiles.ts. The profile STRUCTURE
 * is defined here; content generation is deferred to Phase 4.
 */

import type { CANSDocument } from '../activation/cans-schema.js';

/** Specification for a single workspace file to supplement. */
export interface WorkspaceFileSpec {
  filename: string;
  generateContent: (data: CANSDocument, philosophy: string) => string;
}

/** A workspace profile defines which files a platform uses and how to populate them. */
export interface WorkspaceProfile {
  platform: string;
  files: WorkspaceFileSpec[];
}

/** OpenClaw profile -- supplements SOUL.md, AGENTS.md, and USER.md. */
export const openclawProfile: WorkspaceProfile = {
  platform: 'openclaw',
  files: [
    {
      filename: 'SOUL.md',
      generateContent: (_data, _philosophy) => {
        throw new Error('SOUL.md content generation not yet implemented (Phase 4)');
      },
    },
    {
      filename: 'AGENTS.md',
      generateContent: (_data) => {
        throw new Error('AGENTS.md content generation not yet implemented (Phase 4)');
      },
    },
    {
      filename: 'USER.md',
      generateContent: (_data) => {
        throw new Error('USER.md content generation not yet implemented (Phase 4)');
      },
    },
  ],
};

/** AGENTS.md standard profile -- merges all clinical content into a single AGENTS.md. */
export const agentsStandardProfile: WorkspaceProfile = {
  platform: 'agents-standard',
  files: [
    {
      filename: 'AGENTS.md',
      generateContent: (_data, _philosophy) => {
        throw new Error('AGENTS.md content generation not yet implemented (Phase 4)');
      },
    },
  ],
};

/** Standalone profile -- no workspace file supplementation. */
export const standaloneProfile: WorkspaceProfile = {
  platform: 'standalone',
  files: [],
};

const PROFILES: Record<string, WorkspaceProfile> = {
  openclaw: openclawProfile,
  'agents-standard': agentsStandardProfile,
  standalone: standaloneProfile,
};

/** Returns the workspace profile for the given platform name. Falls back to openclaw. */
export function getWorkspaceProfile(platform: string): WorkspaceProfile {
  return PROFILES[platform] ?? openclawProfile;
}
