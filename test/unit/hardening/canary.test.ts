/**
 * Unit tests for the hook liveness canary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupCanary } from '../../../src/hardening/canary.js';
import type { PlatformAdapter } from '../../../src/adapters/types.js';
import type { AuditPipeline } from '../../../src/audit/pipeline.js';

function createMockAdapter(): PlatformAdapter {
  return {
    platform: 'test',
    getWorkspacePath: () => '/test',
    onBeforeToolCall: vi.fn(),
    onAgentBootstrap: vi.fn(),
    registerCliCommand: vi.fn(),
    registerBackgroundService: vi.fn(),
    registerSlashCommand: vi.fn(),
    log: vi.fn(),
    registerHook: vi.fn(),
  };
}

function createMockAudit(): AuditPipeline {
  return {
    log: vi.fn(),
    logBlocked: vi.fn(),
    verifyChain: vi.fn(),
    getSessionId: vi.fn(),
    createTraceId: vi.fn(),
  } as unknown as AuditPipeline;
}

describe('setupCanary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns if no hook fires within timeout', () => {
    const adapter = createMockAdapter();
    const audit = createMockAudit();

    setupCanary(adapter, audit);

    // Fast-forward past the 30s canary timeout
    vi.advanceTimersByTime(31_000);

    expect(adapter.log).toHaveBeenCalledWith(
      'warn',
      '[CareAgent] before_tool_call hook did NOT fire. Safety Guard is degraded.',
    );
  });

  it('does not warn if markVerified is called before timeout', () => {
    const adapter = createMockAdapter();
    const audit = createMockAudit();

    const canary = setupCanary(adapter, audit);
    canary.markVerified();

    vi.advanceTimersByTime(31_000);

    // adapter.log should NOT have been called with the warning
    const warnCalls = (adapter.log as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'warn' && (call[1] as string).includes('did NOT fire'),
    );
    expect(warnCalls).toHaveLength(0);
  });

  it('isVerified returns false initially', () => {
    const adapter = createMockAdapter();
    const audit = createMockAudit();

    const canary = setupCanary(adapter, audit);
    expect(canary.isVerified()).toBe(false);
  });

  it('isVerified returns true after markVerified', () => {
    const adapter = createMockAdapter();
    const audit = createMockAudit();

    const canary = setupCanary(adapter, audit);
    canary.markVerified();
    expect(canary.isVerified()).toBe(true);
  });

  it('markVerified only logs audit once on repeated calls', () => {
    const adapter = createMockAdapter();
    const audit = createMockAudit();

    const canary = setupCanary(adapter, audit);
    canary.markVerified();
    canary.markVerified();
    canary.markVerified();

    // audit.log should be called exactly once for 'hook_canary' verified
    const auditCalls = (audit.log as ReturnType<typeof vi.fn>).mock.calls;
    expect(auditCalls).toHaveLength(1);
  });
});
