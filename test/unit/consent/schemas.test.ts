/**
 * Unit tests for consent engine TypeBox schemas.
 */

import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  ConsentActionSchema,
  ConsentPostureSchema,
  HealthLiteracyLevelSchema,
  ConsentRecordSchema,
  ConsentDecisionSchema,
  ConsentPromptSchema,
  CustomConsentRuleSchema,
  ConsentEngineConfigSchema,
} from '../../../src/consent/schemas.js';

describe('ConsentActionSchema', () => {
  const validActions = [
    'data:read', 'data:write', 'message:send', 'message:receive',
    'acl:grant', 'acl:revoke', 'handshake:initiate', 'handshake:accept',
  ];

  for (const action of validActions) {
    it(`accepts "${action}"`, () => {
      expect(Value.Check(ConsentActionSchema, action)).toBe(true);
    });
  }

  it('rejects invalid action', () => {
    expect(Value.Check(ConsentActionSchema, 'data:delete')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(Value.Check(ConsentActionSchema, '')).toBe(false);
  });
});

describe('ConsentPostureSchema', () => {
  it('accepts deny-all', () => {
    expect(Value.Check(ConsentPostureSchema, 'deny-all')).toBe(true);
  });

  it('accepts allow-trusted', () => {
    expect(Value.Check(ConsentPostureSchema, 'allow-trusted')).toBe(true);
  });

  it('accepts custom', () => {
    expect(Value.Check(ConsentPostureSchema, 'custom')).toBe(true);
  });

  it('rejects invalid posture', () => {
    expect(Value.Check(ConsentPostureSchema, 'allow-all')).toBe(false);
  });
});

describe('HealthLiteracyLevelSchema', () => {
  it('accepts basic', () => {
    expect(Value.Check(HealthLiteracyLevelSchema, 'basic')).toBe(true);
  });

  it('accepts intermediate', () => {
    expect(Value.Check(HealthLiteracyLevelSchema, 'intermediate')).toBe(true);
  });

  it('accepts advanced', () => {
    expect(Value.Check(HealthLiteracyLevelSchema, 'advanced')).toBe(true);
  });

  it('rejects invalid level', () => {
    expect(Value.Check(HealthLiteracyLevelSchema, 'expert')).toBe(false);
  });
});

describe('ConsentRecordSchema', () => {
  it('validates a complete consent record', () => {
    const record = {
      id: 'abc-123',
      action: 'data:read',
      actorId: 'provider-1',
      decision: 'allow',
      reason: 'Patient approved',
      correlationId: 'corr-456',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-02-01T00:00:00Z',
      revoked: false,
      literacyLevel: 'basic',
    };
    expect(Value.Check(ConsentRecordSchema, record)).toBe(true);
  });

  it('validates a minimal consent record (no optional fields)', () => {
    const record = {
      id: 'abc-123',
      action: 'data:read',
      actorId: 'provider-1',
      decision: 'deny',
      correlationId: 'corr-456',
      createdAt: '2026-01-01T00:00:00Z',
      revoked: false,
    };
    expect(Value.Check(ConsentRecordSchema, record)).toBe(true);
  });

  it('rejects record with invalid decision', () => {
    const record = {
      id: 'abc-123',
      action: 'data:read',
      actorId: 'provider-1',
      decision: 'maybe',
      correlationId: 'corr-456',
      createdAt: '2026-01-01T00:00:00Z',
      revoked: false,
    };
    expect(Value.Check(ConsentRecordSchema, record)).toBe(false);
  });
});

describe('ConsentDecisionSchema', () => {
  it('validates an allowed decision', () => {
    const decision = {
      allowed: true,
      reason: 'Trusted provider',
      requiresPrompt: false,
    };
    expect(Value.Check(ConsentDecisionSchema, decision)).toBe(true);
  });

  it('validates a denied decision requiring prompt', () => {
    const decision = {
      allowed: false,
      reason: 'No consent record',
      requiresPrompt: true,
    };
    expect(Value.Check(ConsentDecisionSchema, decision)).toBe(true);
  });

  it('validates a decision with optional fields', () => {
    const decision = {
      allowed: true,
      reason: 'Explicit consent',
      consentId: 'abc-123',
      correlationId: 'corr-456',
      requiresPrompt: false,
    };
    expect(Value.Check(ConsentDecisionSchema, decision)).toBe(true);
  });
});

describe('ConsentPromptSchema', () => {
  it('validates a complete prompt', () => {
    const prompt = {
      action: 'data:read',
      actorId: 'dr-smith',
      literacyLevel: 'basic',
      text: 'Dr. Smith wants to see your records. Allow?',
      correlationId: 'corr-789',
    };
    expect(Value.Check(ConsentPromptSchema, prompt)).toBe(true);
  });
});

describe('CustomConsentRuleSchema', () => {
  it('validates a rule with actor', () => {
    const rule = {
      action: 'data:read',
      actorId: 'provider-1',
      decision: 'allow',
    };
    expect(Value.Check(CustomConsentRuleSchema, rule)).toBe(true);
  });

  it('validates a rule without actor (general)', () => {
    const rule = {
      action: 'message:send',
      decision: 'deny',
    };
    expect(Value.Check(CustomConsentRuleSchema, rule)).toBe(true);
  });
});

describe('ConsentEngineConfigSchema', () => {
  it('validates a deny-all config', () => {
    const config = { posture: 'deny-all' };
    expect(Value.Check(ConsentEngineConfigSchema, config)).toBe(true);
  });

  it('validates an allow-trusted config with trust list', () => {
    const config = {
      posture: 'allow-trusted',
      trustList: [
        { npi: '1234567890', trust_level: 'active', provider_name: 'Dr. Smith' },
      ],
    };
    expect(Value.Check(ConsentEngineConfigSchema, config)).toBe(true);
  });

  it('validates a custom config with rules', () => {
    const config = {
      posture: 'custom',
      customRules: [
        { action: 'data:read', decision: 'allow' },
        { action: 'data:write', actorId: 'provider-1', decision: 'deny' },
      ],
      defaultLiteracyLevel: 'intermediate',
    };
    expect(Value.Check(ConsentEngineConfigSchema, config)).toBe(true);
  });
});
