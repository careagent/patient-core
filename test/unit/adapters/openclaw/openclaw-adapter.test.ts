/**
 * Unit tests for OpenClaw adapter.
 */

import { describe, it, expect, vi } from 'vitest';
import { createOpenClawAdapter, triggerHook } from '../../../../src/adapters/openclaw/index.js';

describe('createOpenClawAdapter', () => {
  it('returns an adapter with platform "openclaw"', () => {
    const adapter = createOpenClawAdapter({});
    expect(adapter.platform).toBe('openclaw');
  });

  it('getWorkspacePath returns correct path from api.workspaceDir', () => {
    const adapter = createOpenClawAdapter({ workspaceDir: '/test/workspace' });
    expect(adapter.getWorkspacePath()).toBe('/test/workspace');
  });

  it('getWorkspacePath falls back to api.config.workspaceDir', () => {
    const adapter = createOpenClawAdapter({ config: { workspaceDir: '/test/config' } });
    expect(adapter.getWorkspacePath()).toBe('/test/config');
  });

  it('getWorkspacePath falls back to api.context.workspaceDir', () => {
    const adapter = createOpenClawAdapter({ context: { workspaceDir: '/test/context' } });
    expect(adapter.getWorkspacePath()).toBe('/test/context');
  });

  it('getWorkspacePath falls back to process.cwd() when no workspace found', () => {
    const adapter = createOpenClawAdapter({});
    expect(adapter.getWorkspacePath()).toBe(process.cwd());
  });

  it('onBeforeToolCall registers handler via raw.on', () => {
    const onFn = vi.fn();
    const adapter = createOpenClawAdapter({ on: onFn });
    const handler = vi.fn();
    adapter.onBeforeToolCall(handler);
    expect(onFn).toHaveBeenCalledWith('before_tool_call', handler);
  });

  it('registerCliCommand calls raw.registerCli', () => {
    const registerCli = vi.fn((cb: Function) => {
      cb({ program: { command: () => ({ description: () => ({ action: () => {} }) }) } });
    });
    const adapter = createOpenClawAdapter({ registerCli });
    adapter.registerCliCommand({ name: 'test', description: 'test cmd', handler: () => {} });
    expect(registerCli).toHaveBeenCalled();
  });

  it('log calls raw.log when available', () => {
    const logFn = vi.fn();
    const adapter = createOpenClawAdapter({ log: logFn });
    adapter.log('info', 'test message');
    expect(logFn).toHaveBeenCalledWith('info', 'test message', undefined);
  });

  it('log falls back to console when raw.log is not available', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const adapter = createOpenClawAdapter({});
    adapter.log('info', 'test message');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('graceful degradation: adapter with minimal API does not throw on any method', () => {
    const adapter = createOpenClawAdapter({});
    expect(() => adapter.getWorkspacePath()).not.toThrow();
    expect(() => adapter.onBeforeToolCall(() => ({ block: false }))).not.toThrow();
    expect(() => adapter.onAgentBootstrap(() => {})).not.toThrow();
    expect(() => adapter.registerCliCommand({ name: 'test', description: 'test', handler: () => {} })).not.toThrow();
    expect(() => adapter.registerBackgroundService({ id: 'test', start: () => {} })).not.toThrow();
    expect(() => adapter.registerSlashCommand({ name: 'test', description: 'test', handler: () => Promise.resolve() })).not.toThrow();
    expect(() => adapter.registerHook('test', () => {})).not.toThrow();
    expect(() => adapter.log('info', 'test')).not.toThrow();
  });

  it('registerHook stores handler in internal map', () => {
    const adapter = createOpenClawAdapter({});
    const handler = vi.fn();
    adapter.registerHook('test-hook', handler);
    // Verify no throw -- internal map is private, but registering works
    expect(() => adapter.registerHook('test-hook', handler)).not.toThrow();
  });

  it('onAgentBootstrap registers handler via raw.on', () => {
    const onFn = vi.fn();
    const adapter = createOpenClawAdapter({ on: onFn });
    const handler = vi.fn();
    adapter.onAgentBootstrap(handler);
    expect(onFn).toHaveBeenCalledWith('agent:bootstrap', handler);
  });

  it('registerBackgroundService calls raw.registerService', () => {
    const registerService = vi.fn();
    const adapter = createOpenClawAdapter({ registerService });
    adapter.registerBackgroundService({ id: 'test-service', start: () => {} });
    expect(registerService).toHaveBeenCalled();
  });

  it('registerSlashCommand calls raw.registerCommand', () => {
    const registerCommand = vi.fn();
    const adapter = createOpenClawAdapter({ registerCommand });
    adapter.registerSlashCommand({ name: '/test', description: 'test', handler: async () => {} });
    expect(registerCommand).toHaveBeenCalled();
  });

  it('log with data passes data to raw.log', () => {
    const logFn = vi.fn();
    const adapter = createOpenClawAdapter({ log: logFn });
    adapter.log('warn', 'test', { key: 'value' });
    expect(logFn).toHaveBeenCalledWith('warn', 'test', { key: 'value' });
  });

  it('log with data falls back to console when raw.log unavailable', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createOpenClawAdapter({});
    adapter.log('warn', 'test warning', { detail: 42 });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('test warning'),
      { detail: 42 },
    );
    consoleSpy.mockRestore();
  });

  it('onBeforeToolCall handles raw.on throwing', () => {
    const adapter = createOpenClawAdapter({
      on: () => { throw new Error('broken'); },
    });
    expect(() => adapter.onBeforeToolCall(() => ({ block: false }))).not.toThrow();
  });

  it('onAgentBootstrap handles raw.on throwing', () => {
    const adapter = createOpenClawAdapter({
      on: () => { throw new Error('broken'); },
    });
    expect(() => adapter.onAgentBootstrap(() => {})).not.toThrow();
  });

  it('registerCliCommand handles raw.registerCli throwing', () => {
    const adapter = createOpenClawAdapter({
      registerCli: () => { throw new Error('broken'); },
    });
    expect(() => adapter.registerCliCommand({ name: 'test', description: 'test', handler: () => {} })).not.toThrow();
  });

  it('registerBackgroundService handles raw.registerService throwing', () => {
    const adapter = createOpenClawAdapter({
      registerService: () => { throw new Error('broken'); },
    });
    expect(() => adapter.registerBackgroundService({ id: 'test', start: () => {} })).not.toThrow();
  });

  it('registerSlashCommand handles raw.registerCommand throwing', () => {
    const adapter = createOpenClawAdapter({
      registerCommand: () => { throw new Error('broken'); },
    });
    expect(() => adapter.registerSlashCommand({ name: '/test', description: 'test', handler: async () => {} })).not.toThrow();
  });

  it('registerHook handles internal error gracefully', () => {
    const adapter = createOpenClawAdapter({});
    // Multiple registrations to same hook name should not throw
    adapter.registerHook('multi', () => {});
    adapter.registerHook('multi', () => {});
    expect(() => adapter.registerHook('multi', () => {})).not.toThrow();
  });

  it('log handles raw.log throwing gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const adapter = createOpenClawAdapter({
      log: () => { throw new Error('broken'); },
    });
    // Should fall through to console
    expect(() => adapter.log('info', 'fallback test')).not.toThrow();
    consoleSpy.mockRestore();
  });
});

describe('triggerHook', () => {
  it('calls registered handlers for a hook name', () => {
    const adapter = createOpenClawAdapter({});
    const handler = vi.fn();
    adapter.registerHook('my-hook', handler);
    triggerHook('my-hook', 'arg1', 'arg2');
    expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('does not throw for unregistered hook names', () => {
    expect(() => triggerHook('nonexistent')).not.toThrow();
  });

  it('swallows errors from individual hook handlers', () => {
    const adapter = createOpenClawAdapter({});
    adapter.registerHook('bad-hook', () => { throw new Error('handler error'); });
    const goodHandler = vi.fn();
    adapter.registerHook('bad-hook', goodHandler);
    expect(() => triggerHook('bad-hook')).not.toThrow();
    // The good handler should still be called
    expect(goodHandler).toHaveBeenCalled();
  });
});
