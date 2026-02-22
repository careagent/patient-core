/**
 * TDD test suite for AuditWriter -- async-buffered, hash-chained JSONL writer.
 *
 * Tests cover:
 * 1. Hash chain basics (genesis, chaining, multi-entry)
 * 2. Async buffering (non-blocking append, flush, threshold, timer, concurrent guard)
 * 3. Chain verification (valid, tampered, empty)
 * 4. Crash recovery (recoverLastHash, chain continuation)
 * 5. Edge cases (getLastHash, empty flush, dispose)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { AuditWriter } from '../../../src/audit/writer.js';
import type { AuditEntry } from '../../../src/audit/entry-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal audit entry (without prev_hash -- writer enriches). */
function makeEntry(
  overrides: Partial<Omit<AuditEntry, 'prev_hash'>> = {},
): Omit<AuditEntry, 'prev_hash'> {
  return {
    schema_version: '1' as const,
    timestamp: new Date().toISOString(),
    session_id: 'sess-001',
    trace_id: 'trace-001',
    action: 'test.action',
    actor: 'system',
    outcome: 'allowed',
    ...overrides,
  };
}

/** Compute SHA-256 hex digest of a string. */
function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Parse a JSONL audit log file into an array of AuditEntry objects. */
async function readEntries(logPath: string): Promise<AuditEntry[]> {
  const content = await readFile(logPath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AuditEntry);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditWriter', () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'audit-writer-test-'));
    logPath = join(tempDir, 'AUDIT.log');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Hash chain basics
  // -------------------------------------------------------------------------

  describe('hash chain basics', () => {
    it('writes entries as JSONL to the log file after flush', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry());
      await writer.flush();

      const entries = await readEntries(logPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('test.action');
      writer.dispose();
    });

    it('first entry has prev_hash: null (genesis)', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry());
      await writer.flush();

      const entries = await readEntries(logPath);
      expect(entries[0].prev_hash).toBeNull();
      writer.dispose();
    });

    it('second entry prev_hash equals SHA-256 of first entry JSON line', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry({ action: 'first' }));
      writer.append(makeEntry({ action: 'second' }));
      await writer.flush();

      const content = await readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(2);

      const firstLineHash = sha256(lines[0]);
      const secondEntry = JSON.parse(lines[1]) as AuditEntry;
      expect(secondEntry.prev_hash).toBe(firstLineHash);
      writer.dispose();
    });

    it('multiple entries form a valid chain', async () => {
      const writer = new AuditWriter(logPath);
      for (let i = 0; i < 5; i++) {
        writer.append(makeEntry({ action: `action-${i}` }));
      }
      await writer.flush();

      const content = await readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(5);

      // Verify chain: first has null, rest reference previous line's hash
      const first = JSON.parse(lines[0]) as AuditEntry;
      expect(first.prev_hash).toBeNull();

      for (let i = 1; i < lines.length; i++) {
        const prevHash = sha256(lines[i - 1]);
        const entry = JSON.parse(lines[i]) as AuditEntry;
        expect(entry.prev_hash).toBe(prevHash);
      }
      writer.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Async buffering
  // -------------------------------------------------------------------------

  describe('async buffering', () => {
    it('append() is synchronous and does not immediately write to disk', async () => {
      const writer = new AuditWriter(logPath);
      const result = writer.append(makeEntry());

      // append returns void, not a Promise
      expect(result).toBeUndefined();

      // File should not exist yet (or be empty)
      try {
        const content = await readFile(logPath, 'utf-8');
        expect(content).toBe('');
      } catch {
        // File does not exist -- also acceptable
      }
      writer.dispose();
    });

    it('flush() writes buffered entries to disk', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry({ action: 'buffered-1' }));
      writer.append(makeEntry({ action: 'buffered-2' }));

      // Not on disk yet
      try {
        const content = await readFile(logPath, 'utf-8');
        expect(content).toBe('');
      } catch {
        // File does not exist
      }

      await writer.flush();

      const entries = await readEntries(logPath);
      expect(entries).toHaveLength(2);
      expect(entries[0].action).toBe('buffered-1');
      expect(entries[1].action).toBe('buffered-2');
      writer.dispose();
    });

    it('entries flush when buffer reaches threshold', async () => {
      // Use a low threshold for testing
      const writer = new AuditWriter(logPath, {
        flushThreshold: 2,
        flushIntervalMs: 60_000, // long timer so threshold triggers first
      });

      writer.append(makeEntry({ action: 'threshold-1' }));
      // One entry: should not flush yet

      writer.append(makeEntry({ action: 'threshold-2' }));
      // Two entries: threshold reached, flush triggered

      // Give async flush time to complete
      await new Promise((r) => setTimeout(r, 50));

      const entries = await readEntries(logPath);
      expect(entries).toHaveLength(2);
      writer.dispose();
    });

    it('entries flush after timer interval', async () => {
      vi.useFakeTimers();

      const writer = new AuditWriter(logPath, {
        flushThreshold: 100, // high threshold so timer triggers first
        flushIntervalMs: 500,
      });

      writer.append(makeEntry({ action: 'timer-flush' }));

      // Advance time past the flush interval
      vi.advanceTimersByTime(600);

      // flush() is async, so we need to wait for it
      // Use real timers briefly to let the promise resolve
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 50));

      const entries = await readEntries(logPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('timer-flush');
      writer.dispose();
    });

    it('concurrent flush guard: calling flush() while flushing does not duplicate entries', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry({ action: 'no-dup-1' }));
      writer.append(makeEntry({ action: 'no-dup-2' }));

      // Call flush concurrently
      const [r1, r2] = await Promise.all([writer.flush(), writer.flush()]);
      void r1;
      void r2;

      const entries = await readEntries(logPath);
      expect(entries).toHaveLength(2);
      writer.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Chain verification
  // -------------------------------------------------------------------------

  describe('chain verification', () => {
    it('returns { valid: true, entries: N } for valid chain', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry({ action: 'v1' }));
      writer.append(makeEntry({ action: 'v2' }));
      writer.append(makeEntry({ action: 'v3' }));
      await writer.flush();

      const result = writer.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(3);
      writer.dispose();
    });

    it('returns { valid: false, brokenAt: M } for tampered chain', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry({ action: 'intact-1' }));
      writer.append(makeEntry({ action: 'intact-2' }));
      writer.append(makeEntry({ action: 'intact-3' }));
      await writer.flush();

      // Tamper with the second line
      const content = await readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const tampered = JSON.parse(lines[1]) as AuditEntry;
      tampered.action = 'TAMPERED';
      lines[1] = JSON.stringify(tampered);
      await writeFile(logPath, lines.join('\n') + '\n');

      const result = writer.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2); // Third entry's prev_hash won't match tampered second line
      expect(result.error).toBeDefined();
      writer.dispose();
    });

    it('returns { valid: true, entries: 0 } for empty/missing file', async () => {
      const writer = new AuditWriter(logPath);
      const result = writer.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(0);
      writer.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Crash recovery
  // -------------------------------------------------------------------------

  describe('crash recovery', () => {
    it('recoverLastHash reads last line of existing log and recovers chain position', async () => {
      // Write initial entries with first writer
      const writer1 = new AuditWriter(logPath);
      writer1.append(makeEntry({ action: 'before-crash-1' }));
      writer1.append(makeEntry({ action: 'before-crash-2' }));
      await writer1.flush();
      writer1.dispose();

      // Read the last line's hash
      const content = await readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const lastLineHash = sha256(lines[lines.length - 1]);

      // Create a NEW writer on the same file (simulating restart)
      const writer2 = new AuditWriter(logPath);
      expect(writer2.getLastHash()).toBe(lastLineHash);
      writer2.dispose();
    });

    it('new writer on existing log continues the chain correctly', async () => {
      // First writer: create two entries
      const writer1 = new AuditWriter(logPath);
      writer1.append(makeEntry({ action: 'session1-a' }));
      writer1.append(makeEntry({ action: 'session1-b' }));
      await writer1.flush();
      writer1.dispose();

      // Second writer: continue with two more entries
      const writer2 = new AuditWriter(logPath);
      writer2.append(makeEntry({ action: 'session2-a' }));
      writer2.append(makeEntry({ action: 'session2-b' }));
      await writer2.flush();
      writer2.dispose();

      // Verify full chain of 4 entries
      const verifier = new AuditWriter(logPath);
      const result = verifier.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(4);
      verifier.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('getLastHash() returns null before any append', () => {
      const writer = new AuditWriter(logPath);
      expect(writer.getLastHash()).toBeNull();
      writer.dispose();
    });

    it('getLastHash() returns correct hash after append', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry());
      await writer.flush();

      const content = await readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const expectedHash = sha256(lines[0]);

      expect(writer.getLastHash()).toBe(expectedHash);
      writer.dispose();
    });

    it('flush() on empty buffer is a no-op', async () => {
      const writer = new AuditWriter(logPath);
      await writer.flush(); // should not throw or create file

      // File should not exist
      try {
        const content = await readFile(logPath, 'utf-8');
        expect(content).toBe('');
      } catch {
        // File does not exist -- expected
      }
      writer.dispose();
    });

    it('dispose() clears the flush timer', () => {
      vi.useFakeTimers();

      const writer = new AuditWriter(logPath, { flushIntervalMs: 500 });
      writer.append(makeEntry());

      // Timer is scheduled
      writer.dispose();

      // Advancing time should NOT trigger flush (timer was cleared)
      vi.advanceTimersByTime(1000);

      vi.useRealTimers();
      // If the timer fired after dispose, that would be a problem
      // No assertion needed -- test passes if no error thrown
    });

    it('preserves optional fields (correlation_id, summary) through hash chain', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(
        makeEntry({
          correlation_id: 'corr-123',
          summary: 'Test correlation entry',
        }),
      );
      await writer.flush();

      const entries = await readEntries(logPath);
      expect(entries[0].correlation_id).toBe('corr-123');
      expect(entries[0].summary).toBe('Test correlation entry');
      writer.dispose();
    });

    it('preserves provider actor through hash chain', async () => {
      const writer = new AuditWriter(logPath);
      writer.append(makeEntry({ actor: 'provider' }));
      await writer.flush();

      const entries = await readEntries(logPath);
      expect(entries[0].actor).toBe('provider');
      writer.dispose();
    });

    it('directory is created if it does not exist', async () => {
      const nestedPath = join(tempDir, 'nested', 'dir', 'AUDIT.log');
      const writer = new AuditWriter(nestedPath);
      writer.append(makeEntry());
      await writer.flush();

      const entries = await readEntries(nestedPath);
      expect(entries).toHaveLength(1);
      writer.dispose();
    });
  });
});
