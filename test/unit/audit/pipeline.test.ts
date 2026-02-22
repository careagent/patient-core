/**
 * TDD tests for AuditPipeline -- high-level audit API with session management,
 * bilateral correlation, entry enrichment, and flush passthrough.
 *
 * Uses real temp directories and verifies actual JSONL output after flush.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

import { AuditPipeline } from '../../../src/audit/pipeline.js';
import type { AuditLogInput } from '../../../src/audit/pipeline.js';

// UUID v4 regex pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let workspace: string;
let pipeline: AuditPipeline;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'audit-pipeline-'));
});

afterEach(async () => {
  if (pipeline) {
    pipeline.dispose();
  }
  await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Construction
// ---------------------------------------------------------------------------

describe('AuditPipeline construction', () => {
  it('creates .careagent/ directory under workspace path if it does not exist', () => {
    pipeline = new AuditPipeline(workspace);
    expect(existsSync(join(workspace, '.careagent'))).toBe(true);
  });

  it('generates a session_id in UUIDv4 format if none provided', () => {
    pipeline = new AuditPipeline(workspace);
    expect(pipeline.getSessionId()).toMatch(UUID_RE);
  });

  it('uses provided session_id if given in constructor', () => {
    const customId = '11111111-1111-4111-a111-111111111111';
    pipeline = new AuditPipeline(workspace, customId);
    expect(pipeline.getSessionId()).toBe(customId);
  });
});

// ---------------------------------------------------------------------------
// 2. log() entry enrichment
// ---------------------------------------------------------------------------

describe('AuditPipeline.log() entry enrichment', () => {
  beforeEach(() => {
    pipeline = new AuditPipeline(workspace);
  });

  it('adds schema_version "1" to every entry', async () => {
    pipeline.log({ action: 'test', outcome: 'allowed' });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].schema_version).toBe('1');
  });

  it('adds ISO 8601 timestamp to every entry', async () => {
    pipeline.log({ action: 'test', outcome: 'allowed' });
    await pipeline.flush();

    const entries = await readEntries();
    // ISO 8601 format check
    expect(new Date(entries[0].timestamp).toISOString()).toBe(entries[0].timestamp);
  });

  it('adds session_id from pipeline session to every entry', async () => {
    pipeline.log({ action: 'test', outcome: 'allowed' });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].session_id).toBe(pipeline.getSessionId());
  });

  it('adds generated trace_id (UUIDv4) if not provided in input', async () => {
    pipeline.log({ action: 'test', outcome: 'allowed' });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].trace_id).toMatch(UUID_RE);
  });

  it('uses provided trace_id if given in input', async () => {
    const traceId = '22222222-2222-4222-a222-222222222222';
    pipeline.log({ action: 'test', outcome: 'allowed', trace_id: traceId });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].trace_id).toBe(traceId);
  });

  it('defaults actor to "system" if not provided', async () => {
    pipeline.log({ action: 'test', outcome: 'allowed' });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].actor).toBe('system');
  });

  it('uses provided actor value', async () => {
    pipeline.log({ action: 'test', outcome: 'allowed', actor: 'patient' });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].actor).toBe('patient');
  });

  it('passes through all optional fields (target, action_state, details, blocked_reason, blocking_layer, correlation_id, summary)', async () => {
    pipeline.log({
      action: 'share_data',
      outcome: 'denied',
      actor: 'agent',
      target: 'provider-npi-123',
      action_state: 'patient-rejected',
      details: { category: 'medications', count: 3 },
      blocked_reason: 'Patient denied sharing',
      blocking_layer: 'consent-gate',
      correlation_id: '33333333-3333-4333-a333-333333333333',
      summary: 'Patient rejected medication sharing',
    });
    await pipeline.flush();

    const entries = await readEntries();
    const e = entries[0];
    expect(e.target).toBe('provider-npi-123');
    expect(e.action_state).toBe('patient-rejected');
    expect(e.details).toEqual({ category: 'medications', count: 3 });
    expect(e.blocked_reason).toBe('Patient denied sharing');
    expect(e.blocking_layer).toBe('consent-gate');
    expect(e.correlation_id).toBe('33333333-3333-4333-a333-333333333333');
    expect(e.summary).toBe('Patient rejected medication sharing');
  });

  it('does NOT include optional fields that are undefined (no target: undefined in JSON)', async () => {
    pipeline.log({ action: 'test', outcome: 'allowed' });
    await pipeline.flush();

    const raw = await readRawLines();
    const parsed = JSON.parse(raw[0]);
    expect(parsed).not.toHaveProperty('target');
    expect(parsed).not.toHaveProperty('action_state');
    expect(parsed).not.toHaveProperty('details');
    expect(parsed).not.toHaveProperty('blocked_reason');
    expect(parsed).not.toHaveProperty('blocking_layer');
    expect(parsed).not.toHaveProperty('correlation_id');
    expect(parsed).not.toHaveProperty('summary');
  });

  it('accepts provider as an actor value', async () => {
    pipeline.log({ action: 'inbound_message', outcome: 'allowed', actor: 'provider' });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].actor).toBe('provider');
  });
});

// ---------------------------------------------------------------------------
// 3. logBlocked() convenience
// ---------------------------------------------------------------------------

describe('AuditPipeline.logBlocked()', () => {
  beforeEach(() => {
    pipeline = new AuditPipeline(workspace);
  });

  it('logs with outcome "denied" and actor "system"', async () => {
    pipeline.logBlocked({
      action: 'share_labs',
      blocked_reason: 'No consent',
      blocking_layer: 'consent-gate',
    });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].outcome).toBe('denied');
    expect(entries[0].actor).toBe('system');
  });

  it('passes through action, target, blocked_reason, blocking_layer, action_state, details', async () => {
    pipeline.logBlocked({
      action: 'share_labs',
      target: 'provider-456',
      blocked_reason: 'Consent expired',
      blocking_layer: 'consent-gate',
      action_state: 'system-blocked',
      details: { expiry: '2025-01-01' },
    });
    await pipeline.flush();

    const entries = await readEntries();
    const e = entries[0];
    expect(e.action).toBe('share_labs');
    expect(e.target).toBe('provider-456');
    expect(e.blocked_reason).toBe('Consent expired');
    expect(e.blocking_layer).toBe('consent-gate');
    expect(e.action_state).toBe('system-blocked');
    expect(e.details).toEqual({ expiry: '2025-01-01' });
  });
});

// ---------------------------------------------------------------------------
// 4. Bilateral correlation (AUDT-03)
// ---------------------------------------------------------------------------

describe('Bilateral correlation (AUDT-03)', () => {
  beforeEach(() => {
    pipeline = new AuditPipeline(workspace);
  });

  it('createCorrelationId() returns a UUIDv4 string', () => {
    const id = pipeline.createCorrelationId();
    expect(id).toMatch(UUID_RE);
  });

  it('correlation_id in AuditLogInput is passed through to the entry', async () => {
    const corrId = pipeline.createCorrelationId();
    pipeline.log({
      action: 'outbound_message',
      outcome: 'allowed',
      correlation_id: corrId,
    });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].correlation_id).toBe(corrId);
  });

  it('multiple entries can share the same correlation_id (bilateral pair)', async () => {
    const corrId = pipeline.createCorrelationId();
    pipeline.log({
      action: 'outbound_message',
      outcome: 'allowed',
      correlation_id: corrId,
    });
    pipeline.log({
      action: 'inbound_response',
      outcome: 'allowed',
      correlation_id: corrId,
    });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].correlation_id).toBe(corrId);
    expect(entries[1].correlation_id).toBe(corrId);
  });
});

// ---------------------------------------------------------------------------
// 5. Session and trace management
// ---------------------------------------------------------------------------

describe('Session and trace management', () => {
  beforeEach(() => {
    pipeline = new AuditPipeline(workspace);
  });

  it('getSessionId() returns the session ID used for all entries', async () => {
    const sessionId = pipeline.getSessionId();
    pipeline.log({ action: 'a', outcome: 'allowed' });
    pipeline.log({ action: 'b', outcome: 'denied' });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries[0].session_id).toBe(sessionId);
    expect(entries[1].session_id).toBe(sessionId);
  });

  it('createTraceId() returns a new UUIDv4 each call', () => {
    const t1 = pipeline.createTraceId();
    const t2 = pipeline.createTraceId();
    expect(t1).toMatch(UUID_RE);
    expect(t2).toMatch(UUID_RE);
    expect(t1).not.toBe(t2);
  });

  it('trace IDs are distinct from session IDs', () => {
    const sessionId = pipeline.getSessionId();
    const traceId = pipeline.createTraceId();
    expect(traceId).not.toBe(sessionId);
  });
});

// ---------------------------------------------------------------------------
// 6. Flush and chain verification passthrough
// ---------------------------------------------------------------------------

describe('Flush and chain verification passthrough', () => {
  beforeEach(() => {
    pipeline = new AuditPipeline(workspace);
  });

  it('flush() returns a Promise (delegates to writer.flush())', async () => {
    pipeline.log({ action: 'test', outcome: 'allowed' });
    const result = pipeline.flush();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('verifyChain() returns chain verification result (delegates to writer.verifyChain())', () => {
    const result = pipeline.verifyChain();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('entries');
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(0);
  });

  it('after log() + flush(), entries are persisted to disk', async () => {
    pipeline.log({ action: 'persist_test', outcome: 'allowed' });
    await pipeline.flush();

    const entries = await readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('persist_test');
  });

  it('verifyChain() returns valid after log + flush', async () => {
    pipeline.log({ action: 'test1', outcome: 'allowed' });
    pipeline.log({ action: 'test2', outcome: 'denied' });
    await pipeline.flush();

    const result = pipeline.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 7. dispose() cleanup
// ---------------------------------------------------------------------------

describe('AuditPipeline.dispose()', () => {
  it('dispose() calls writer.dispose() to clear timers', () => {
    pipeline = new AuditPipeline(workspace);
    // Should not throw
    expect(() => pipeline.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 8. Data safety (AUDT-06)
// ---------------------------------------------------------------------------

describe('Data safety (AUDT-06)', () => {
  beforeEach(() => {
    pipeline = new AuditPipeline(workspace);
  });

  it('entries logged from call patterns matching existing entry points produce valid JSONL', async () => {
    // Pattern from openclaw.ts / standalone.ts -- activation check
    pipeline.log({
      action: 'activation_check',
      actor: 'system',
      outcome: 'active',
      details: { identity_type: 'patient' },
    });

    // Pattern from hardening/engine.ts -- hardening check denied
    pipeline.log({
      action: 'hardening_check',
      target: 'bash',
      outcome: 'denied',
      details: { layer: 'tool-policy', reason: 'Tool not in allowlist' },
      blocking_layer: 'tool-policy',
      blocked_reason: 'Tool not in allowlist',
      trace_id: pipeline.createTraceId(),
    });

    // Pattern from canary.ts -- hook canary
    pipeline.log({
      action: 'hook_canary',
      actor: 'system',
      outcome: 'allowed',
      details: { hook: 'before_tool_call', status: 'verified' },
    });

    await pipeline.flush();

    const raw = await readRawLines();
    expect(raw).toHaveLength(3);

    // Verify each line is valid JSON
    for (const line of raw) {
      expect(() => JSON.parse(line)).not.toThrow();
      const entry = JSON.parse(line);
      // Verify required fields present
      expect(entry).toHaveProperty('schema_version', '1');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('session_id');
      expect(entry).toHaveProperty('trace_id');
      expect(entry).toHaveProperty('action');
      expect(entry).toHaveProperty('actor');
      expect(entry).toHaveProperty('outcome');
      expect(entry).toHaveProperty('prev_hash');
    }

    // Verify hash chain is valid
    const result = pipeline.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readEntries(): Promise<Record<string, unknown>[]> {
  const lines = await readRawLines();
  return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
}

async function readRawLines(): Promise<string[]> {
  const logPath = join(workspace, '.careagent', 'AUDIT.log');
  const content = await readFile(logPath, 'utf-8');
  return content.split('\n').filter((l) => l.trim().length > 0);
}
