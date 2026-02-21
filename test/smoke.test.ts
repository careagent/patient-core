/**
 * Smoke tests for @careagent/patient-core.
 *
 * Verifies the default export is a register function that accepts a mock API.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockAPI } from './fixtures/mock-api.js';

describe('@careagent/patient-core', () => {
  it('exports a register function', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.default).toBe('function');
  });

  it('register function accepts a mock API without throwing', async () => {
    const mod = await import('../src/index.js');
    const tmpDir = mkdtempSync(join(tmpdir(), 'careagent-smoke-'));
    const api = createMockAPI(tmpDir);
    expect(() => mod.default(api)).not.toThrow();
  });
});
