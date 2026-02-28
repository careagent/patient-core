/**
 * Unit tests for the consent engine.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConsentEngine } from '../../../src/consent/engine.js';
import type { ConsentEngineConfig } from '../../../src/consent/schemas.js';

describe('createConsentEngine', () => {
  // -------------------------------------------------------------------------
  // Deny-all posture
  // -------------------------------------------------------------------------

  describe('deny-all posture', () => {
    it('denies all actions when no consent records exist', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const decision = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Deny-all');
      expect(decision.requiresPrompt).toBe(true);
    });

    it('allows actions with an explicit consent record', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'provider-1', decision: 'allow' });
      const decision = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(decision.allowed).toBe(true);
      expect(decision.requiresPrompt).toBe(false);
    });

    it('denies actions with an explicit deny record', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'provider-1', decision: 'deny' });
      const decision = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(decision.allowed).toBe(false);
      expect(decision.requiresPrompt).toBe(false);
    });

    it('each action type requires its own consent', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'provider-1', decision: 'allow' });

      const readDecision = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(readDecision.allowed).toBe(true);

      const writeDecision = engine.check({ action: 'data:write', actorId: 'provider-1' });
      expect(writeDecision.allowed).toBe(false);
      expect(writeDecision.requiresPrompt).toBe(true);
    });

    it('consent is per-actor', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'provider-1', decision: 'allow' });

      const p1 = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(p1.allowed).toBe(true);

      const p2 = engine.check({ action: 'data:read', actorId: 'provider-2' });
      expect(p2.allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Allow-trusted posture
  // -------------------------------------------------------------------------

  describe('allow-trusted posture', () => {
    const config: ConsentEngineConfig = {
      posture: 'allow-trusted',
      trustList: [
        { npi: '1234567890', trust_level: 'active', provider_name: 'Dr. Smith' },
        { npi: '0000000000', trust_level: 'pending', provider_name: 'Dr. Jones' },
        { npi: '9999999999', trust_level: 'suspended', provider_name: 'Dr. Bad' },
        { npi: '1111111111', trust_level: 'revoked', provider_name: 'Dr. Gone' },
      ],
    };

    it('allows actions from active trusted providers', () => {
      const engine = createConsentEngine(config);
      const decision = engine.check({ action: 'data:read', actorId: '1234567890' });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toContain('Trusted provider');
      expect(decision.reason).toContain('Dr. Smith');
    });

    it('denies actions from pending providers', () => {
      const engine = createConsentEngine(config);
      const decision = engine.check({ action: 'data:read', actorId: '0000000000' });
      expect(decision.allowed).toBe(false);
      expect(decision.requiresPrompt).toBe(true);
    });

    it('denies actions from suspended providers', () => {
      const engine = createConsentEngine(config);
      const decision = engine.check({ action: 'data:read', actorId: '9999999999' });
      expect(decision.allowed).toBe(false);
    });

    it('denies actions from revoked providers', () => {
      const engine = createConsentEngine(config);
      const decision = engine.check({ action: 'data:read', actorId: '1111111111' });
      expect(decision.allowed).toBe(false);
    });

    it('denies actions from unknown actors', () => {
      const engine = createConsentEngine(config);
      const decision = engine.check({ action: 'data:read', actorId: 'unknown-provider' });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('not in the trust list');
    });

    it('explicit consent record overrides trust list', () => {
      const engine = createConsentEngine(config);
      // Explicitly deny a trusted provider
      engine.record({ action: 'data:read', actorId: '1234567890', decision: 'deny' });
      const decision = engine.check({ action: 'data:read', actorId: '1234567890' });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Explicit consent denied');
    });
  });

  // -------------------------------------------------------------------------
  // Custom posture
  // -------------------------------------------------------------------------

  describe('custom posture', () => {
    const config: ConsentEngineConfig = {
      posture: 'custom',
      customRules: [
        { action: 'data:read', decision: 'allow' },
        { action: 'data:write', actorId: 'provider-1', decision: 'allow' },
        { action: 'data:write', decision: 'deny' },
        { action: 'message:send', decision: 'deny' },
      ],
    };

    it('applies general action rules', () => {
      const engine = createConsentEngine(config);
      const decision = engine.check({ action: 'data:read', actorId: 'anyone' });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toContain('Custom rule');
    });

    it('actor-specific rules override general rules', () => {
      const engine = createConsentEngine(config);
      // provider-1 has explicit allow for data:write
      const p1 = engine.check({ action: 'data:write', actorId: 'provider-1' });
      expect(p1.allowed).toBe(true);
      // provider-2 falls through to general deny for data:write
      const p2 = engine.check({ action: 'data:write', actorId: 'provider-2' });
      expect(p2.allowed).toBe(false);
    });

    it('denies actions with no matching rule', () => {
      const engine = createConsentEngine(config);
      const decision = engine.check({ action: 'handshake:initiate', actorId: 'anyone' });
      expect(decision.allowed).toBe(false);
      expect(decision.requiresPrompt).toBe(true);
      expect(decision.reason).toContain('No custom rule');
    });
  });

  // -------------------------------------------------------------------------
  // Consent expiration
  // -------------------------------------------------------------------------

  describe('consent expiration', () => {
    it('expired consent is treated as no consent (deny)', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      // Record a consent that expires in the past
      engine.record({
        action: 'data:read',
        actorId: 'provider-1',
        decision: 'allow',
        expiresAt: '2020-01-01T00:00:00Z',
      });
      const decision = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(decision.allowed).toBe(false);
      expect(decision.requiresPrompt).toBe(true);
    });

    it('non-expired consent is treated as valid', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({
        action: 'data:read',
        actorId: 'provider-1',
        decision: 'allow',
        expiresAt: '2099-12-31T23:59:59Z',
      });
      const decision = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(decision.allowed).toBe(true);
    });

    it('consent without expiry never expires', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({
        action: 'data:read',
        actorId: 'provider-1',
        decision: 'allow',
      });
      const decision = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(decision.allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Consent revocation
  // -------------------------------------------------------------------------

  describe('consent revocation', () => {
    it('revoked consent is treated as no consent', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const record = engine.record({
        action: 'data:read',
        actorId: 'provider-1',
        decision: 'allow',
      });

      // Verify it works before revocation
      expect(engine.check({ action: 'data:read', actorId: 'provider-1' }).allowed).toBe(true);

      // Revoke
      engine.revoke(record.id);

      // Should now be denied
      const decision = engine.check({ action: 'data:read', actorId: 'provider-1' });
      expect(decision.allowed).toBe(false);
    });

    it('revoke throws for non-existent consent', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      expect(() => engine.revoke('non-existent-id')).toThrow('not found');
    });

    it('revoke throws for already-revoked consent', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const record = engine.record({
        action: 'data:read',
        actorId: 'provider-1',
        decision: 'allow',
      });
      engine.revoke(record.id);
      expect(() => engine.revoke(record.id)).toThrow('already revoked');
    });

    it('revoked record has revokedAt timestamp', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const record = engine.record({
        action: 'data:read',
        actorId: 'provider-1',
        decision: 'allow',
      });
      engine.revoke(record.id);
      const records = engine.getRecords();
      const revoked = records.find(r => r.id === record.id);
      expect(revoked?.revoked).toBe(true);
      expect(revoked?.revokedAt).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Record management
  // -------------------------------------------------------------------------

  describe('record management', () => {
    it('record() returns a consent record with correlation ID', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const record = engine.record({
        action: 'data:read',
        actorId: 'provider-1',
        decision: 'allow',
      });
      expect(record.id).toBeDefined();
      expect(record.correlationId).toBeDefined();
      expect(record.action).toBe('data:read');
      expect(record.actorId).toBe('provider-1');
      expect(record.decision).toBe('allow');
      expect(record.revoked).toBe(false);
      expect(record.createdAt).toBeDefined();
    });

    it('each record gets a unique correlation ID', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const r1 = engine.record({ action: 'data:read', actorId: 'p1', decision: 'allow' });
      const r2 = engine.record({ action: 'data:read', actorId: 'p2', decision: 'allow' });
      expect(r1.correlationId).not.toBe(r2.correlationId);
    });

    it('getRecords() returns all records', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'p1', decision: 'allow' });
      engine.record({ action: 'data:write', actorId: 'p2', decision: 'deny' });
      expect(engine.getRecords()).toHaveLength(2);
    });

    it('getRecords() returns a copy (no mutation)', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'p1', decision: 'allow' });
      const records = engine.getRecords();
      records.length = 0;
      expect(engine.getRecords()).toHaveLength(1);
    });

    it('most recent record wins when multiple exist', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      engine.record({ action: 'data:read', actorId: 'p1', decision: 'allow' });
      engine.record({ action: 'data:read', actorId: 'p1', decision: 'deny' });
      const decision = engine.check({ action: 'data:read', actorId: 'p1' });
      expect(decision.allowed).toBe(false);
    });

    it('record stores literacy level', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const record = engine.record({
        action: 'data:read',
        actorId: 'p1',
        decision: 'allow',
        literacyLevel: 'advanced',
      });
      expect(record.literacyLevel).toBe('advanced');
    });

    it('record uses default literacy level when not specified', () => {
      const engine = createConsentEngine({
        posture: 'deny-all',
        defaultLiteracyLevel: 'intermediate',
      });
      const record = engine.record({
        action: 'data:read',
        actorId: 'p1',
        decision: 'allow',
      });
      expect(record.literacyLevel).toBe('intermediate');
    });
  });

  // -------------------------------------------------------------------------
  // Consent prompts
  // -------------------------------------------------------------------------

  describe('consent prompts', () => {
    it('generates a prompt with correlation ID', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const prompt = engine.getPrompt({
        action: 'data:read',
        actorId: 'Dr. Smith',
        literacyLevel: 'basic',
      });
      expect(prompt.text).toContain('Dr. Smith');
      expect(prompt.correlationId).toBeDefined();
      expect(prompt.action).toBe('data:read');
      expect(prompt.literacyLevel).toBe('basic');
    });

    it('each prompt gets a unique correlation ID', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      const p1 = engine.getPrompt({ action: 'data:read', actorId: 'p1', literacyLevel: 'basic' });
      const p2 = engine.getPrompt({ action: 'data:read', actorId: 'p1', literacyLevel: 'basic' });
      expect(p1.correlationId).not.toBe(p2.correlationId);
    });
  });

  // -------------------------------------------------------------------------
  // Posture access
  // -------------------------------------------------------------------------

  describe('posture', () => {
    it('getPosture returns the configured posture', () => {
      const engine = createConsentEngine({ posture: 'deny-all' });
      expect(engine.getPosture()).toBe('deny-all');
    });

    it('returns allow-trusted posture', () => {
      const engine = createConsentEngine({ posture: 'allow-trusted' });
      expect(engine.getPosture()).toBe('allow-trusted');
    });

    it('returns custom posture', () => {
      const engine = createConsentEngine({ posture: 'custom' });
      expect(engine.getPosture()).toBe('custom');
    });
  });
});
