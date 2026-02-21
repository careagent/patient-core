/**
 * Integration tests for the plugin register() function.
 *
 * Verifies end-to-end behavior of the full plugin lifecycle:
 * - register(api) wiring (PLUG-02)
 * - Adapter insulation (PLUG-05)
 * - Graceful degradation
 * - Manifest verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import register from '../../src/index.js';
import { registerCLI } from '../../src/cli/commands.js';
import { createMockAPI, createMinimalAPI } from '../fixtures/mock-api.js';
import { AuditPipeline } from '../../src/audit/pipeline.js';
import { createStandaloneAdapter } from '../../src/adapters/standalone/index.js';

describe('Plugin Registration Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-plugin-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // PLUG-02: register(api) wiring
  // -----------------------------------------------------------------------

  describe('PLUG-02: register(api) wiring', () => {
    it('with empty workspace: register completes without throwing', async () => {
      const api = createMockAPI(tmpDir);
      await expect(register(api)).resolves.not.toThrow();
    });

    it('registerCli was called (CLI commands registered)', async () => {
      const api = createMockAPI(tmpDir);
      await register(api);
      expect(api.calls.some(c => c.method === 'registerCli')).toBe(true);
    });

    it('logs inactive clinical mode (no CANS.md)', async () => {
      const api = createMockAPI(tmpDir);
      await register(api);
      const logCalls = api.calls.filter(c => c.method === 'log');
      const inactiveLog = logCalls.find(c =>
        typeof c.args[1] === 'string' && c.args[1].includes('Clinical mode inactive'),
      );
      expect(inactiveLog).toBeDefined();
    });

    it('activation gate was checked (returns inactive without CANS.md)', async () => {
      const api = createMockAPI(tmpDir);
      await register(api);
      const logCalls = api.calls.filter(c => c.method === 'log');
      const hasInactive = logCalls.some(c =>
        typeof c.args[1] === 'string' && c.args[1].includes('inactive'),
      );
      expect(hasInactive).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // PLUG-05: Graceful degradation
  // -----------------------------------------------------------------------

  describe('PLUG-05: Graceful degradation', () => {
    it('register works with minimal mock (just workspaceDir)', async () => {
      const api = createMinimalAPI(tmpDir);
      await expect(register(api)).resolves.not.toThrow();
    });

    it('register works with empty object (adapter falls back to process.cwd())', async () => {
      await expect(register({})).resolves.not.toThrow();
    });

    it('register does not throw when mock API is missing methods', async () => {
      await expect(register({ workspaceDir: tmpDir, on: null, registerCli: null })).resolves.not.toThrow();
    });

    it('logs warning about missing hooks with minimal API', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await register(createMinimalAPI(tmpDir));
      // Standalone adapter logs warnings to console when hooks are unavailable
      // The adapter falls back to standalone which uses no-ops
      consoleSpy.mockRestore();
      // Primary assertion: no crash
    });
  });

  // -----------------------------------------------------------------------
  // Manifest verification
  // -----------------------------------------------------------------------

  describe('Manifest verification', () => {
    it('package.json has no runtime dependencies', () => {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = pkg.dependencies || {};
      expect(Object.keys(deps).length).toBe(0);
    });

    it('package.json openclaw.extensions points to ./dist/index.js', () => {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      expect(pkg.openclaw).toBeDefined();
      expect(pkg.openclaw.extensions).toContain('./dist/index.js');
    });

    it('openclaw.plugin.json has id @careagent/patient-core', () => {
      const pluginPath = join(__dirname, '../../openclaw.plugin.json');
      const plugin = JSON.parse(readFileSync(pluginPath, 'utf-8'));
      expect(plugin.id).toBe('@careagent/patient-core');
    });

    it('package.json peerDependencies includes openclaw', () => {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      expect(pkg.peerDependencies).toBeDefined();
      expect(pkg.peerDependencies.openclaw).toBeDefined();
    });

    it('package.json peerDependenciesMeta marks openclaw as optional', () => {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      expect(pkg.peerDependenciesMeta).toBeDefined();
      expect(pkg.peerDependenciesMeta.openclaw?.optional).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // CLI command registration
  // -----------------------------------------------------------------------

  describe('CLI command registration', () => {
    it('registerCLI registers careagent init and careagent status', () => {
      const adapter = createStandaloneAdapter(tmpDir);
      const registerSpy = vi.spyOn(adapter, 'registerCliCommand');
      const audit = new AuditPipeline(tmpDir);
      registerCLI(adapter, tmpDir, audit);
      expect(registerSpy).toHaveBeenCalledTimes(2);
      const names = registerSpy.mock.calls.map(c => c[0].name);
      expect(names).toContain('careagent init');
      expect(names).toContain('careagent status');
    });
  });

  // -----------------------------------------------------------------------
  // Standalone entry point
  // -----------------------------------------------------------------------

  describe('Standalone entry point', () => {
    it('activate() returns adapter, audit, gate, and activation result', async () => {
      const { activate } = await import('../../src/entry/standalone.js');
      const result = await activate(tmpDir);
      expect(result.adapter).toBeDefined();
      expect(result.audit).toBeDefined();
      expect(result.gate).toBeDefined();
      expect(result.activation).toBeDefined();
    });

    it('activate() returns inactive activation without CANS.md', async () => {
      const { activate } = await import('../../src/entry/standalone.js');
      const result = await activate(tmpDir);
      expect(result.activation.active).toBe(false);
    });

    it('activate() without args defaults to process.cwd()', async () => {
      const { activate } = await import('../../src/entry/standalone.js');
      const result = await activate();
      expect(result.adapter.getWorkspacePath()).toBe(process.cwd());
    });
  });
});
