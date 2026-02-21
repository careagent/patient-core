/**
 * Unit tests for computeHash, verifyIntegrity, and writeIntegritySidecar.
 *
 * Uses a tmp directory (mkdtemp) for file I/O in tests.
 * Tests all 3 verifyIntegrity outcomes: no-sidecar, hash-mismatch, valid.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeHash,
  verifyIntegrity,
  writeIntegritySidecar,
} from '../../../src/activation/cans-integrity.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'cans-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// computeHash
// ---------------------------------------------------------------------------

describe('computeHash', () => {
  it('returns stable output for the same input (idempotent)', () => {
    const content = 'hello world';
    const hash1 = computeHash(content);
    const hash2 = computeHash(content);
    expect(hash1).toBe(hash2);
  });

  it('returns different output for different input', () => {
    const hash1 = computeHash('hello');
    const hash2 = computeHash('world');
    expect(hash1).not.toBe(hash2);
  });

  it('returns 64-char lowercase hex string', () => {
    const hash = computeHash('test content');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// verifyIntegrity
// ---------------------------------------------------------------------------

describe('verifyIntegrity', () => {
  it('returns { valid: false, reason: "no-sidecar" } when no sidecar file exists', async () => {
    const cansPath = join(tmpDir, 'CANS.md');
    const content = 'some content';
    await writeFile(cansPath, content, 'utf8');

    const result = await verifyIntegrity(cansPath, content);
    expect(result.valid).toBe(false);
    expect(result).toHaveProperty('reason', 'no-sidecar');
  });

  it('returns { valid: true } when sidecar exists and hash matches', async () => {
    const cansPath = join(tmpDir, 'CANS.md');
    const content = 'verified content';
    await writeFile(cansPath, content, 'utf8');

    // Write the correct hash to the sidecar
    const hash = computeHash(content);
    await writeFile(join(tmpDir, '.CANS.md.sha256'), hash, 'utf8');

    const result = await verifyIntegrity(cansPath, content);
    expect(result.valid).toBe(true);
  });

  it('returns { valid: false, reason: "hash-mismatch" } when hash differs', async () => {
    const cansPath = join(tmpDir, 'CANS.md');
    const content = 'original content';
    await writeFile(cansPath, content, 'utf8');

    // Write a wrong hash to the sidecar
    await writeFile(join(tmpDir, '.CANS.md.sha256'), 'deadbeef'.repeat(8), 'utf8');

    const result = await verifyIntegrity(cansPath, content);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('hash-mismatch');
      expect(result).toHaveProperty('stored');
      expect(result).toHaveProperty('computed');
    }
  });

  it('distinguishes no-sidecar from hash-mismatch in IntegrityResult.reason', async () => {
    const cansPath = join(tmpDir, 'CANS.md');
    const content = 'content for distinction test';
    await writeFile(cansPath, content, 'utf8');

    // No sidecar
    const noSidecar = await verifyIntegrity(cansPath, content);
    expect(noSidecar.valid).toBe(false);
    if (!noSidecar.valid) expect(noSidecar.reason).toBe('no-sidecar');

    // Write wrong hash
    await writeFile(join(tmpDir, '.CANS.md.sha256'), 'wrong-hash', 'utf8');
    const mismatch = await verifyIntegrity(cansPath, content);
    expect(mismatch.valid).toBe(false);
    if (!mismatch.valid) expect(mismatch.reason).toBe('hash-mismatch');
  });
});

// ---------------------------------------------------------------------------
// writeIntegritySidecar
// ---------------------------------------------------------------------------

describe('writeIntegritySidecar', () => {
  it('creates .CANS.md.sha256 file in same directory', async () => {
    const cansPath = join(tmpDir, 'CANS.md');
    const content = 'content to sign';
    await writeFile(cansPath, content, 'utf8');

    await writeIntegritySidecar(cansPath, content);

    const sidecarContent = await readFile(join(tmpDir, '.CANS.md.sha256'), 'utf8');
    expect(sidecarContent).toHaveLength(64);
  });

  it('writes the sha256 hex of the provided content', async () => {
    const cansPath = join(tmpDir, 'CANS.md');
    const content = 'hash me please';
    await writeFile(cansPath, content, 'utf8');

    await writeIntegritySidecar(cansPath, content);

    const sidecarContent = await readFile(join(tmpDir, '.CANS.md.sha256'), 'utf8');
    const expectedHash = computeHash(content);
    expect(sidecarContent).toBe(expectedHash);
  });

  it('verifyIntegrity returns { valid: true } after writeIntegritySidecar', async () => {
    const cansPath = join(tmpDir, 'CANS.md');
    const content = 'round-trip test content';
    await writeFile(cansPath, content, 'utf8');

    await writeIntegritySidecar(cansPath, content);
    const result = await verifyIntegrity(cansPath, content);
    expect(result.valid).toBe(true);
  });
});
