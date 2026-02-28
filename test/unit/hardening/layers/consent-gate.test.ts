/**
 * Unit tests for Layer 5: Consent Gate.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { checkConsentGate, attachConsentEngine, detachConsentEngine, mapToolToAction } from '../../../../src/hardening/layers/consent-gate.js';
import { createConsentEngine } from '../../../../src/consent/engine.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';

const cans = { version: '1', identity_type: 'patient' } as CANSDocument;

describe('checkConsentGate', () => {
  afterEach(() => {
    detachConsentEngine();
  });

  describe('without consent engine (graceful degradation)', () => {
    it('returns allowed: true when no engine is attached', () => {
      const result = checkConsentGate({ toolName: 'Read' }, cans);
      expect(result.allowed).toBe(true);
      expect(result.layer).toBe('consent-gate');
      expect(result.reason).toContain('graceful degradation');
    });
  });

  describe('with consent engine attached', () => {
    it('denies actions under deny-all posture with no records', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      attachConsentEngine(engine);

      const result = checkConsentGate({ toolName: 'Read', sessionKey: 'provider-1' }, cans);
      expect(result.allowed).toBe(false);
      expect(result.layer).toBe('consent-gate');
      expect(result.reason).toContain('Deny-all');
    });

    it('allows actions with explicit consent record', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'provider-1', decision: 'allow' });
      attachConsentEngine(engine);

      const result = checkConsentGate({ toolName: 'Read', sessionKey: 'provider-1' }, cans);
      expect(result.allowed).toBe(true);
    });

    it('uses session key as actor ID', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'session-abc', decision: 'allow' });
      attachConsentEngine(engine);

      const result = checkConsentGate({ toolName: 'Read', sessionKey: 'session-abc' }, cans);
      expect(result.allowed).toBe(true);
    });

    it('defaults actor to "unknown" when no session key', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'unknown', decision: 'allow' });
      attachConsentEngine(engine);

      const result = checkConsentGate({ toolName: 'Read' }, cans);
      expect(result.allowed).toBe(true);
    });

    it('allows trusted providers under allow-trusted posture', () => {
      const engine = createConsentEngine({
        posture: 'allow-trusted',
        trustList: [
          { npi: 'trusted-npi', trust_level: 'active', provider_name: 'Dr. Trust' },
        ],
      });
      attachConsentEngine(engine);

      const result = checkConsentGate({ toolName: 'Read', sessionKey: 'trusted-npi' }, cans);
      expect(result.allowed).toBe(true);
    });
  });
});

describe('mapToolToAction', () => {
  it('maps Read to data:read', () => {
    expect(mapToolToAction({ toolName: 'Read' })).toBe('data:read');
  });

  it('maps Write to data:write', () => {
    expect(mapToolToAction({ toolName: 'Write' })).toBe('data:write');
  });

  it('maps Edit to data:write', () => {
    expect(mapToolToAction({ toolName: 'Edit' })).toBe('data:write');
  });

  it('maps NotebookEdit to data:write', () => {
    expect(mapToolToAction({ toolName: 'NotebookEdit' })).toBe('data:write');
  });

  it('maps Bash to data:write', () => {
    expect(mapToolToAction({ toolName: 'Bash' })).toBe('data:write');
  });

  it('maps SendMessage to message:send', () => {
    expect(mapToolToAction({ toolName: 'SendMessage' })).toBe('message:send');
  });

  it('maps unknown tools to data:read', () => {
    expect(mapToolToAction({ toolName: 'SomeUnknownTool' })).toBe('data:read');
  });
});
