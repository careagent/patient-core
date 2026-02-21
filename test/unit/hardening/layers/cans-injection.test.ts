/**
 * Unit tests for Layer 3: CANS Protocol Injection.
 *
 * Updated to use real CANSDocument shape instead of
 * { version, identity_type } minimal stub from Phase 1.
 */

import { describe, it, expect, vi } from 'vitest';
import { checkCansInjection, extractProtocolRules, injectProtocol } from '../../../../src/hardening/layers/cans-injection.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';
import type { BootstrapContext } from '../../../../src/adapters/types.js';

/** Real minimal CANSDocument shape (required fields only) */
const cans: CANSDocument = {
  schema_version: '1.0',
  identity_type: 'patient',
  consent_posture: 'deny',
  health_literacy_level: 'standard',
};

describe('checkCansInjection', () => {
  it('always returns allowed (pass-through layer)', () => {
    const result = checkCansInjection({ toolName: 'Read' }, cans);
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('cans-injection');
    expect(result.reason).toBe('protocol injected at bootstrap');
  });
});

describe('extractProtocolRules', () => {
  it('returns string containing CareAgent Patient Protocol header', () => {
    const rules = extractProtocolRules(cans);
    expect(rules).toContain('CareAgent Patient Protocol');
  });

  it('includes identity_type in output', () => {
    const rules = extractProtocolRules(cans);
    expect(rules).toContain('patient');
  });

  it('includes consent warning', () => {
    const rules = extractProtocolRules(cans);
    expect(rules).toContain('NEVER share patient data without explicit consent');
  });

  it('includes consent_posture in protocol output when present', () => {
    const rules = extractProtocolRules(cans);
    expect(rules).toContain('Consent Posture: deny');
  });

  it('includes consent_posture: allow when set', () => {
    const allowCans: CANSDocument = { ...cans, consent_posture: 'allow' };
    const rules = extractProtocolRules(allowCans);
    expect(rules).toContain('Consent Posture: allow');
  });

  it('includes active provider count when providers exist', () => {
    const cansWithProviders: CANSDocument = {
      ...cans,
      providers: [
        {
          npi: '1234567890',
          role: 'primary_care',
          trust_level: 'active',
          provider_name: 'Dr. Jane Smith',
          last_changed: '2026-01-15T09:00:00Z',
        },
        {
          npi: '0987654321',
          role: 'specialist',
          trust_level: 'suspended',
          provider_name: 'Dr. Bob Jones',
          last_changed: '2026-01-10T09:00:00Z',
        },
      ],
    };
    const rules = extractProtocolRules(cansWithProviders);
    expect(rules).toContain('Active Providers: 1');
  });

  it('includes autonomy summary when autonomy is configured', () => {
    const cansWithAutonomy: CANSDocument = {
      ...cans,
      autonomy: { share: 'supervised', request: 'supervised', review: 'autonomous' },
    };
    const rules = extractProtocolRules(cansWithAutonomy);
    expect(rules).toContain('Autonomy: share=supervised, request=supervised, review=autonomous');
  });
});

describe('injectProtocol', () => {
  it('adds CAREAGENT_PROTOCOL.md to bootstrap context', () => {
    const context: BootstrapContext = { addFile: vi.fn() };
    injectProtocol(context, cans);
    expect(context.addFile).toHaveBeenCalledWith(
      'CAREAGENT_PROTOCOL.md',
      expect.stringContaining('CareAgent Patient Protocol'),
    );
  });
});
