/**
 * Unit tests for Layer 6: Data Minimization (allow-all stub).
 */

import { describe, it, expect } from 'vitest';
import { checkDataMinimization } from '../../../../src/hardening/layers/data-minimization.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';

const cans = { version: '1', identity_type: 'patient' } as CANSDocument;

describe('checkDataMinimization', () => {
  it('returns allowed: true (stub)', () => {
    const result = checkDataMinimization({ toolName: 'Read' }, cans);
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('data-minimization');
  });

  it('returns stub reason mentioning Phase 5', () => {
    const result = checkDataMinimization({ toolName: 'Read' }, cans);
    expect(result.reason).toContain('stub');
    expect(result.reason).toContain('data-minimization');
    expect(result.reason).toContain('Phase 5');
  });
});
