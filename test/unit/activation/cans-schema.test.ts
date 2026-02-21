/**
 * Unit tests for CANSSchema, validateCANS, and all sub-schemas.
 *
 * Validates PCANS-01 (schema correctness), PCANS-03 (TypeBox validation),
 * and PCANS-07 (trust list shape).
 */

import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  CANSSchema,
  CANSDocument,
  validateCANS,
  TrustLevelSchema,
  TrustListEntrySchema,
} from '../../../src/activation/cans-schema.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal valid CANS document (required fields only) */
const minimal: CANSDocument = {
  schema_version: '1.0',
  identity_type: 'patient',
  consent_posture: 'deny',
  health_literacy_level: 'standard',
};

/** Full provider trust list entry */
const activeProvider = {
  npi: '1234567890',
  role: 'primary_care',
  trust_level: 'active' as const,
  provider_name: 'Dr. Jane Smith',
  organization: 'City Medical Group',
  last_changed: '2026-01-15T09:00:00Z',
};

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe('CANSSchema - required fields', () => {
  it('passes for minimal valid document (4 required fields)', () => {
    expect(Value.Check(CANSSchema, minimal)).toBe(true);
  });

  it('fails if schema_version is missing', () => {
    const { schema_version: _, ...missing } = minimal;
    expect(Value.Check(CANSSchema, missing)).toBe(false);
  });

  it('fails if identity_type is missing', () => {
    const { identity_type: _, ...missing } = minimal;
    expect(Value.Check(CANSSchema, missing)).toBe(false);
  });

  it('fails if consent_posture is missing', () => {
    const { consent_posture: _, ...missing } = minimal;
    expect(Value.Check(CANSSchema, missing)).toBe(false);
  });

  it('fails if health_literacy_level is missing', () => {
    const { health_literacy_level: _, ...missing } = minimal;
    expect(Value.Check(CANSSchema, missing)).toBe(false);
  });

  it('rejects identity_type: provider with a discriminator error at path /identity_type', () => {
    const provider = { ...minimal, identity_type: 'provider' };
    expect(Value.Check(CANSSchema, provider)).toBe(false);
    const errors = [...Value.Errors(CANSSchema, provider)];
    const identityError = errors.find(e => e.path === '/identity_type');
    expect(identityError).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// consent_posture values
// ---------------------------------------------------------------------------

describe('CANSSchema - consent_posture', () => {
  it('accepts deny', () => {
    expect(Value.Check(CANSSchema, { ...minimal, consent_posture: 'deny' })).toBe(true);
  });

  it('accepts allow', () => {
    expect(Value.Check(CANSSchema, { ...minimal, consent_posture: 'allow' })).toBe(true);
  });

  it('rejects maybe', () => {
    expect(Value.Check(CANSSchema, { ...minimal, consent_posture: 'maybe' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// health_literacy_level values
// ---------------------------------------------------------------------------

describe('CANSSchema - health_literacy_level', () => {
  it('accepts simplified', () => {
    expect(Value.Check(CANSSchema, { ...minimal, health_literacy_level: 'simplified' })).toBe(true);
  });

  it('accepts standard', () => {
    expect(Value.Check(CANSSchema, { ...minimal, health_literacy_level: 'standard' })).toBe(true);
  });

  it('accepts detailed', () => {
    expect(Value.Check(CANSSchema, { ...minimal, health_literacy_level: 'detailed' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Optional fields - providers (PCANS-07)
// ---------------------------------------------------------------------------

describe('CANSSchema - providers (PCANS-07)', () => {
  it('passes when providers is absent (optional field)', () => {
    expect(Value.Check(CANSSchema, minimal)).toBe(true);
  });

  it('passes with providers: [] (empty trust list is valid)', () => {
    expect(Value.Check(CANSSchema, { ...minimal, providers: [] })).toBe(true);
  });

  it('passes with a full active provider entry', () => {
    expect(Value.Check(CANSSchema, { ...minimal, providers: [activeProvider] })).toBe(true);
  });

  it('passes with trust_level: pending', () => {
    expect(Value.Check(CANSSchema, {
      ...minimal,
      providers: [{ ...activeProvider, trust_level: 'pending' }],
    })).toBe(true);
  });

  it('passes with trust_level: suspended', () => {
    expect(Value.Check(CANSSchema, {
      ...minimal,
      providers: [{ ...activeProvider, trust_level: 'suspended' }],
    })).toBe(true);
  });

  it('passes with trust_level: revoked', () => {
    expect(Value.Check(CANSSchema, {
      ...minimal,
      providers: [{ ...activeProvider, trust_level: 'revoked' }],
    })).toBe(true);
  });

  it('rejects trust_level: unknown with a union error', () => {
    const invalid = {
      ...minimal,
      providers: [{ ...activeProvider, trust_level: 'unknown' }],
    };
    expect(Value.Check(CANSSchema, invalid)).toBe(false);
  });

  it('passes with organization field (optional on entry)', () => {
    expect(Value.Check(CANSSchema, {
      ...minimal,
      providers: [{ ...activeProvider, organization: 'Some Hospital' }],
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Optional fields - autonomy tiers
// ---------------------------------------------------------------------------

describe('CANSSchema - autonomy tiers', () => {
  it('passes when autonomy is absent', () => {
    expect(Value.Check(CANSSchema, minimal)).toBe(true);
  });

  it('passes with valid autonomy tiers', () => {
    expect(Value.Check(CANSSchema, {
      ...minimal,
      autonomy: { share: 'supervised', request: 'supervised', review: 'autonomous' },
    })).toBe(true);
  });

  it('each action type independently accepts supervised|autonomous|manual', () => {
    for (const tier of ['supervised', 'autonomous', 'manual'] as const) {
      expect(Value.Check(CANSSchema, {
        ...minimal,
        autonomy: { share: tier, request: tier, review: tier },
      })).toBe(true);
    }
  });

  it('rejects invalid autonomy tier', () => {
    expect(Value.Check(CANSSchema, {
      ...minimal,
      autonomy: { share: 'invalid', request: 'supervised', review: 'supervised' },
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateCANS()
// ---------------------------------------------------------------------------

describe('validateCANS', () => {
  it('returns typed CANSDocument for valid data without throwing', () => {
    const result = validateCANS(minimal);
    expect(result.identity_type).toBe('patient');
    expect(result.consent_posture).toBe('deny');
  });

  it('throws Error with path info for invalid data (missing field)', () => {
    const { consent_posture: _, ...missing } = minimal;
    expect(() => validateCANS(missing)).toThrow(Error);
    expect(() => validateCANS(missing)).toThrow(/consent_posture/);
  });
});
