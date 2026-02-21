/**
 * Version pinning logic for clinical skills -- stub for Phase 7.
 *
 * Mirrors provider-core's version-pin.ts.
 */

import type { SkillManifest } from './types.js';

export interface VersionPinResult {
  pinned: boolean;
  currentVersion: string;
  approvedVersion: string;
  updateAvailable: boolean;
  availableVersion?: string;
}

/** Check whether a version update is available for a pinned skill (stub -- Phase 7). */
export function checkVersionPin(
  _manifest: SkillManifest,
  _availableVersion?: string,
): VersionPinResult {
  throw new Error('Version pin check not yet implemented (Phase 7)');
}

/** Approve a new version for a skill (stub -- Phase 7). */
export function approveVersion(
  _manifest: SkillManifest,
  _newVersion: string,
): SkillManifest {
  throw new Error('Version approval not yet implemented (Phase 7)');
}
