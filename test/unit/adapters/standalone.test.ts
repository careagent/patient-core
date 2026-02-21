/**
 * Unit tests for standalone adapter.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStandaloneAdapter } from '../../../src/adapters/standalone/index.js';

describe('createStandaloneAdapter', () => {
  it('returns adapter with platform "standalone"', () => {
    const adapter = createStandaloneAdapter();
    expect(adapter.platform).toBe('standalone');
  });

  it('getWorkspacePath returns provided path', () => {
    const adapter = createStandaloneAdapter('/test/workspace');
    expect(adapter.getWorkspacePath()).toBe('/test/workspace');
  });

  it('getWorkspacePath returns process.cwd() when no path provided', () => {
    const adapter = createStandaloneAdapter();
    expect(adapter.getWorkspacePath()).toBe(process.cwd());
  });

  it('all registration methods are no-ops (call without error)', () => {
    const adapter = createStandaloneAdapter();
    expect(() => adapter.onBeforeToolCall(() => ({ block: false }))).not.toThrow();
    expect(() => adapter.onAgentBootstrap(() => {})).not.toThrow();
    expect(() => adapter.registerCliCommand({ name: 'test', description: 'test', handler: () => {} })).not.toThrow();
    expect(() => adapter.registerBackgroundService({ id: 'test', start: () => {} })).not.toThrow();
    expect(() => adapter.registerSlashCommand({ name: 'test', description: 'test', handler: () => Promise.resolve() })).not.toThrow();
    expect(() => adapter.registerHook('test', () => {})).not.toThrow();
  });

  it('log outputs to console', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const adapter = createStandaloneAdapter();
    adapter.log('info', 'test message');
    expect(consoleSpy).toHaveBeenCalledWith('[CareAgent] test message');
    consoleSpy.mockRestore();
  });

  it('log with data passes data to console', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createStandaloneAdapter();
    adapter.log('warn', 'test warning', { key: 'value' });
    expect(consoleSpy).toHaveBeenCalledWith('[CareAgent] test warning', { key: 'value' });
    consoleSpy.mockRestore();
  });
});
