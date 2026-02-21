/**
 * Unit tests for Layer 5: Consent Gate (allow-all stub).
 */

import { describe, it, expect } from 'vitest';
import { checkConsentGate } from '../../../../src/hardening/layers/consent-gate.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';

const cans = { version: '1', identity_type: 'patient' } as CANSDocument;

describe('checkConsentGate', () => {
  it('returns allowed: true (stub)', () => {
    const result = checkConsentGate({ toolName: 'Read' }, cans);
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('consent-gate');
  });

  it('returns stub reason mentioning Phase 5', () => {
    const result = checkConsentGate({ toolName: 'Read' }, cans);
    expect(result.reason).toContain('stub');
    expect(result.reason).toContain('consent-gate');
    expect(result.reason).toContain('Phase 5');
  });
});
