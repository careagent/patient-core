/**
 * Unit tests for consent prompt generation.
 */

import { describe, it, expect } from 'vitest';
import { generateConsentPrompt } from '../../../src/consent/prompts.js';

describe('generateConsentPrompt', () => {
  const correlationId = 'test-corr-123';

  // -------------------------------------------------------------------------
  // Basic literacy level
  // -------------------------------------------------------------------------

  describe('basic literacy level', () => {
    it('generates a simple data:read prompt', () => {
      const text = generateConsentPrompt('data:read', 'Dr. Smith', 'basic', correlationId);
      expect(text).toContain('Dr. Smith');
      expect(text).toContain('health records');
      expect(text).toContain('Allow?');
      expect(text).toContain('Yes/No');
    });

    it('generates a simple data:write prompt', () => {
      const text = generateConsentPrompt('data:write', 'Dr. Smith', 'basic', correlationId);
      expect(text).toContain('Dr. Smith');
      expect(text).toContain('add information');
    });

    it('generates self-contained prompt for message:send', () => {
      const text = generateConsentPrompt('message:send', 'agent', 'basic', correlationId);
      expect(text).toContain('send a message');
      expect(text).toContain('Allow?');
    });

    it('generates self-contained prompt for handshake:initiate', () => {
      const text = generateConsentPrompt('handshake:initiate', 'agent', 'basic', correlationId);
      expect(text).toContain('connect with a provider');
    });

    it('generates prompt for message:receive', () => {
      const text = generateConsentPrompt('message:receive', 'Dr. Smith', 'basic', correlationId);
      expect(text).toContain('Dr. Smith');
      expect(text).toContain('send you a message');
    });

    it('generates prompt for acl:grant', () => {
      const text = generateConsentPrompt('acl:grant', 'Dr. Smith', 'basic', correlationId);
      expect(text).toContain('access');
    });

    it('generates prompt for acl:revoke', () => {
      const text = generateConsentPrompt('acl:revoke', 'Dr. Smith', 'basic', correlationId);
      expect(text).toContain('access');
    });

    it('generates prompt for handshake:accept', () => {
      const text = generateConsentPrompt('handshake:accept', 'Dr. Smith', 'basic', correlationId);
      expect(text).toContain('connect');
    });
  });

  // -------------------------------------------------------------------------
  // Intermediate literacy level
  // -------------------------------------------------------------------------

  describe('intermediate literacy level', () => {
    it('includes more detail for data:read', () => {
      const text = generateConsentPrompt('data:read', 'Dr. Smith', 'intermediate', correlationId);
      expect(text).toContain('Dr. Smith');
      expect(text).toContain('read access');
      expect(text).toContain('Allow this access?');
    });

    it('includes scope detail for data:write', () => {
      const text = generateConsentPrompt('data:write', 'Dr. Smith', 'intermediate', correlationId);
      expect(text).toContain('write access');
      expect(text).toContain('clinical data');
    });
  });

  // -------------------------------------------------------------------------
  // Advanced literacy level
  // -------------------------------------------------------------------------

  describe('advanced literacy level', () => {
    it('includes correlation ID for data:read', () => {
      const text = generateConsentPrompt('data:read', 'dr-smith-uuid', 'advanced', correlationId);
      expect(text).toContain('dr-smith-uuid');
      expect(text).toContain('data:read');
      expect(text).toContain(correlationId);
      expect(text).toContain('Grant consent?');
    });

    it('includes full action type for data:write', () => {
      const text = generateConsentPrompt('data:write', 'dr-smith-uuid', 'advanced', correlationId);
      expect(text).toContain('data:write');
      expect(text).toContain(correlationId);
    });

    it('includes correlation ID for message:send', () => {
      const text = generateConsentPrompt('message:send', 'agent', 'advanced', correlationId);
      expect(text).toContain('message:send');
      expect(text).toContain(correlationId);
    });
  });
});
