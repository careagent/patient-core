/**
 * TDD tests for AuditIntegrityService -- background service that periodically
 * verifies the audit hash chain for tampering detection (DFNS-04).
 *
 * Uses mocked AuditPipeline and adapter to verify behavior without disk I/O.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createAuditIntegrityService } from '../../../src/audit/integrity-service.js';
import type { AuditPipeline } from '../../../src/audit/pipeline.js';
import type { VerifyChainResult } from '../../../src/audit/writer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAudit(chainResult: VerifyChainResult = { valid: true, entries: 5 }) {
  return {
    flush: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    verifyChain: vi.fn<() => VerifyChainResult>().mockReturnValue(chainResult),
  } as unknown as AuditPipeline & {
    flush: ReturnType<typeof vi.fn>;
    verifyChain: ReturnType<typeof vi.fn>;
  };
}

function createMockAdapter() {
  return {
    log: vi.fn<(level: 'info' | 'warn' | 'error', message: string) => void>(),
  };
}

// ---------------------------------------------------------------------------
// 1. Service configuration
// ---------------------------------------------------------------------------

describe('AuditIntegrityService configuration', () => {
  it('returns a ServiceConfig with id "careagent-audit-integrity"', () => {
    const audit = createMockAudit();
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);
    expect(service.id).toBe('careagent-audit-integrity');
  });

  it('has start and stop methods', () => {
    const audit = createMockAudit();
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);
    expect(typeof service.start).toBe('function');
    expect(typeof service.stop).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 2. Startup verification
// ---------------------------------------------------------------------------

describe('AuditIntegrityService startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls audit.flush() before verifyChain() on start', async () => {
    const callOrder: string[] = [];
    const audit = createMockAudit();
    (audit.flush as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('flush');
    });
    (audit.verifyChain as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('verifyChain');
      return { valid: true, entries: 3 };
    });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();

    expect(callOrder).toEqual(['flush', 'verifyChain']);
  });

  it('logs info-level message with entry count on valid chain', async () => {
    const audit = createMockAudit({ valid: true, entries: 42 });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();

    expect(adapter.log).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('42'),
    );
  });

  it('logs error-level message with break point on broken chain', async () => {
    const audit = createMockAudit({
      valid: false,
      entries: 10,
      brokenAt: 7,
      error: 'Hash mismatch at entry 7',
    });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();

    expect(adapter.log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('7'),
    );
  });

  it('does NOT throw on broken chain (reports and continues)', async () => {
    const audit = createMockAudit({
      valid: false,
      entries: 5,
      brokenAt: 3,
      error: 'Hash mismatch at entry 3',
    });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    // Should not throw
    await expect(service.start!()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Periodic verification
// ---------------------------------------------------------------------------

describe('AuditIntegrityService periodic checks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs periodic check every 60 seconds after start', async () => {
    const audit = createMockAudit({ valid: true, entries: 5 });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();

    // Initial startup called flush + verifyChain once each
    expect(audit.flush).toHaveBeenCalledTimes(1);
    expect(audit.verifyChain).toHaveBeenCalledTimes(1);

    // Advance 60 seconds -- periodic check should fire
    await vi.advanceTimersByTimeAsync(60_000);

    expect(audit.flush).toHaveBeenCalledTimes(2);
    expect(audit.verifyChain).toHaveBeenCalledTimes(2);

    // Advance another 60 seconds
    await vi.advanceTimersByTimeAsync(60_000);

    expect(audit.flush).toHaveBeenCalledTimes(3);
    expect(audit.verifyChain).toHaveBeenCalledTimes(3);
  });

  it('logs error on periodic check when chain is broken', async () => {
    const audit = createMockAudit({ valid: true, entries: 5 });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();

    // Switch to broken chain for periodic check
    (audit.verifyChain as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      entries: 10,
      brokenAt: 8,
      error: 'Hash mismatch at entry 8',
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(adapter.log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('8'),
    );
  });

  it('does not log on periodic check when chain is valid (quiet success)', async () => {
    const audit = createMockAudit({ valid: true, entries: 5 });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();

    // Clear any startup logs
    adapter.log.mockClear();

    await vi.advanceTimersByTimeAsync(60_000);

    // Valid chain periodic check should be silent (no log call)
    expect(adapter.log).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Stop lifecycle
// ---------------------------------------------------------------------------

describe('AuditIntegrityService stop lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the periodic interval on stop', async () => {
    const audit = createMockAudit({ valid: true, entries: 5 });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();
    service.stop!();

    // Clear call counts
    (audit.verifyChain as ReturnType<typeof vi.fn>).mockClear();
    (audit.flush as ReturnType<typeof vi.fn>).mockClear();

    // Advance time -- no periodic checks should fire
    await vi.advanceTimersByTimeAsync(120_000);

    expect(audit.flush).not.toHaveBeenCalled();
    expect(audit.verifyChain).not.toHaveBeenCalled();
  });

  it('is idempotent -- calling stop twice does not error', async () => {
    const audit = createMockAudit({ valid: true, entries: 5 });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();

    expect(() => {
      service.stop!();
      service.stop!();
    }).not.toThrow();
  });

  it('stop can be called without start (no-op)', () => {
    const audit = createMockAudit({ valid: true, entries: 5 });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    expect(() => service.stop!()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. Flush before verify
// ---------------------------------------------------------------------------

describe('AuditIntegrityService flush before verify', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls flush() before verifyChain() during periodic checks', async () => {
    const callOrder: string[] = [];
    const audit = createMockAudit();
    (audit.flush as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('flush');
    });
    (audit.verifyChain as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('verifyChain');
      return { valid: true, entries: 5 };
    });
    const adapter = createMockAdapter();
    const service = createAuditIntegrityService(audit, adapter);

    await service.start!();

    // Clear startup order
    callOrder.length = 0;

    // Trigger periodic check
    await vi.advanceTimersByTimeAsync(60_000);

    expect(callOrder).toEqual(['flush', 'verifyChain']);
  });
});
