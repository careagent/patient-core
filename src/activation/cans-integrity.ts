/**
 * CANS.md SHA-256 integrity check -- full implementation.
 *
 * Uses a sidecar file approach: the hash of the raw CANS.md content is stored
 * in `.CANS.md.sha256` (hidden file) in the same directory. This avoids
 * YAML round-trip instability and hashes the exact bytes on disk.
 *
 * Distinguishes two failure modes:
 * - no-sidecar: sidecar file does not exist (CANS.md never signed)
 * - hash-mismatch: sidecar exists but hash differs (tampering or manual edit)
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export type IntegrityResult =
  | { valid: true }
  | { valid: false; reason: 'no-sidecar' }
  | { valid: false; reason: 'hash-mismatch'; stored: string; computed: string };

/**
 * Compute SHA-256 of file content as lowercase hex string.
 * Hashes the raw UTF-8 string exactly as it appears on disk.
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Verify CANS.md integrity against its sidecar hash file.
 * Sidecar location: same directory as cansPath, named .CANS.md.sha256
 *
 * Returns { valid: true } on match.
 * Returns { valid: false, reason: 'no-sidecar' } if sidecar is absent.
 * Returns { valid: false, reason: 'hash-mismatch', ... } if hashes differ.
 */
export async function verifyIntegrity(
  cansPath: string,
  content: string,
): Promise<IntegrityResult> {
  const computed = computeHash(content);
  const sidecarPath = join(dirname(cansPath), '.CANS.md.sha256');

  let stored: string;
  try {
    stored = (await readFile(sidecarPath, 'utf8')).trim();
  } catch {
    return { valid: false, reason: 'no-sidecar' };
  }

  if (stored !== computed) {
    return { valid: false, reason: 'hash-mismatch', stored, computed };
  }

  return { valid: true };
}

/**
 * Write the integrity sidecar file for a CANS.md.
 * Called when generating or re-signing CANS.md (Phase 4 CLI uses this).
 * Phase 2 exports the function; Phase 4 wires it to CLI commands.
 */
export async function writeIntegritySidecar(
  cansPath: string,
  content: string,
): Promise<void> {
  const hash = computeHash(content);
  const sidecarPath = join(dirname(cansPath), '.CANS.md.sha256');
  await writeFile(sidecarPath, hash, 'utf8');
}
