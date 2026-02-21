/**
 * Unit tests for the hardening engine.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHardeningEngine } from '../../../src/hardening/engine.js';
import type { HardeningConfig } from '../../../src/hardening/types.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';
import type { PlatformAdapter } from '../../../src/adapters/types.js';
import type { AuditPipeline } from '../../../src/audit/pipeline.js';

function createMockConfig(): HardeningConfig {
  const cans = { version: '1', identity_type: 'patient' } as CANSDocument;
  const adapter: PlatformAdapter = {
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
  const audit = {
    log: vi.fn(),
    logBlocked: vi.fn(),
    verifyChain: vi.fn(),
    getSessionId: vi.fn().mockReturnValue('test-session'),
    createTraceId: vi.fn().mockReturnValue('test-trace'),
  } as unknown as AuditPipeline;

  return { cans, adapter, audit };
}

describe('createHardeningEngine', () => {
  it('throws if check() called before activate()', () => {
    const engine = createHardeningEngine();
    expect(() => engine.check({ toolName: 'test' })).toThrow('Engine not activated');
  });

  it('activate stores config and allows check() calls', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    engine.activate(config);
    // With no scope/permitted_actions, tool-policy allows by default
    const result = engine.check({ toolName: 'Read' });
    expect(result.allowed).toBe(true);
  });

  it('runs all 6 layers and returns allowed when no denials', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    engine.activate(config);

    const result = engine.check({ toolName: 'Read' });
    expect(result.allowed).toBe(true);
    // Should have logged via audit for each layer pass
    expect(config.audit.log).toHaveBeenCalled();
  });

  it('first deny wins: tool-policy denies unlisted tools', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    // Add scope with permitted_actions to the CANS document
    (config.cans as unknown as Record<string, unknown>).scope = {
      permitted_actions: ['Read', 'Write'],
    };
    engine.activate(config);

    const result = engine.check({ toolName: 'Delete' });
    expect(result.allowed).toBe(false);
    expect(result.layer).toBe('tool-policy');
    expect(result.reason).toContain('Delete');
  });

  it('first deny wins: exec-allowlist denies unlisted binaries', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    engine.activate(config);

    const result = engine.check({ toolName: 'Bash', params: { command: 'rm -rf /' } });
    expect(result.allowed).toBe(false);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.reason).toContain('rm');
  });

  it('all-allow returns the last layer result', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    engine.activate(config);

    const result = engine.check({ toolName: 'Read' });
    expect(result.allowed).toBe(true);
    // Last layer is data-minimization
    expect(result.layer).toBe('data-minimization');
  });

  it('injectProtocol returns array of strings', () => {
    const engine = createHardeningEngine();
    const cans = { version: '1', identity_type: 'patient' } as CANSDocument;
    const lines = engine.injectProtocol(cans);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some(l => l.includes('CareAgent Patient Protocol'))).toBe(true);
  });

  it('registers before_tool_call handler on activate', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    engine.activate(config);
    expect(config.adapter.onBeforeToolCall).toHaveBeenCalled();
  });

  it('registers agent bootstrap handler on activate', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    engine.activate(config);
    expect(config.adapter.onAgentBootstrap).toHaveBeenCalled();
  });

  it('handles audit.createTraceId throwing', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    (config.audit.createTraceId as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('stub');
    });
    engine.activate(config);
    // Should not throw even when createTraceId fails
    const result = engine.check({ toolName: 'Read' });
    expect(result.allowed).toBe(true);
  });

  it('handles audit.log throwing during check', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    (config.audit.log as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('stub');
    });
    engine.activate(config);
    // Should not throw even when audit.log fails
    const result = engine.check({ toolName: 'Read' });
    expect(result.allowed).toBe(true);
  });

  it('handles audit.log throwing on denial', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    (config.cans as unknown as Record<string, unknown>).scope = {
      permitted_actions: ['Read'],
    };
    (config.audit.log as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('stub');
    });
    engine.activate(config);
    // Should return denied result even when audit fails
    const result = engine.check({ toolName: 'Delete' });
    expect(result.allowed).toBe(false);
  });

  it('handles adapter.onBeforeToolCall throwing during activate', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    (config.adapter.onBeforeToolCall as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('broken');
    });
    // Should not throw, should log warning
    expect(() => engine.activate(config)).not.toThrow();
    expect(config.adapter.log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('Failed to register before_tool_call'),
    );
  });

  it('handles adapter.onAgentBootstrap throwing during activate', () => {
    const engine = createHardeningEngine();
    const config = createMockConfig();
    (config.adapter.onAgentBootstrap as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('broken');
    });
    // Should not throw, should log warning
    expect(() => engine.activate(config)).not.toThrow();
    expect(config.adapter.log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('Failed to register bootstrap handler'),
    );
  });
});
