/**
 * Tests for bot TypeBox schemas.
 *
 * Validates that all schemas accept valid data and reject invalid data.
 */

import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  OnboardingStateSchema,
  TelegramUserSchema,
  TelegramChatSchema,
  TelegramMessageSchema,
  TelegramUpdateSchema,
  TelegramGetUpdatesResponseSchema,
  TelegramSendMessageResponseSchema,
  PatientSessionSchema,
  StateTransitionSchema,
} from '../../../src/bot/schemas.js';

describe('Bot TypeBox Schemas', () => {
  // -------------------------------------------------------------------------
  // OnboardingStateSchema
  // -------------------------------------------------------------------------
  describe('OnboardingStateSchema', () => {
    it('accepts all valid states', () => {
      for (const state of ['START', 'AWAITING_NAME', 'AWAITING_CONSENT', 'ENROLLED', 'DECLINED']) {
        expect(Value.Check(OnboardingStateSchema, state)).toBe(true);
      }
    });

    it('rejects invalid states', () => {
      expect(Value.Check(OnboardingStateSchema, 'INVALID')).toBe(false);
      expect(Value.Check(OnboardingStateSchema, '')).toBe(false);
      expect(Value.Check(OnboardingStateSchema, 42)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // TelegramUserSchema
  // -------------------------------------------------------------------------
  describe('TelegramUserSchema', () => {
    it('accepts a valid user with required fields', () => {
      expect(Value.Check(TelegramUserSchema, {
        id: 12345,
        is_bot: false,
        first_name: 'Alice',
      })).toBe(true);
    });

    it('accepts a valid user with optional fields', () => {
      expect(Value.Check(TelegramUserSchema, {
        id: 12345,
        is_bot: false,
        first_name: 'Alice',
        last_name: 'Smith',
        username: 'alice_smith',
      })).toBe(true);
    });

    it('rejects a user missing required fields', () => {
      expect(Value.Check(TelegramUserSchema, { id: 12345 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // TelegramChatSchema
  // -------------------------------------------------------------------------
  describe('TelegramChatSchema', () => {
    it('accepts a valid chat', () => {
      expect(Value.Check(TelegramChatSchema, { id: 999, type: 'private' })).toBe(true);
    });

    it('rejects a chat missing type', () => {
      expect(Value.Check(TelegramChatSchema, { id: 999 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // TelegramMessageSchema
  // -------------------------------------------------------------------------
  describe('TelegramMessageSchema', () => {
    it('accepts a valid message with text', () => {
      expect(Value.Check(TelegramMessageSchema, {
        message_id: 1,
        chat: { id: 999, type: 'private' },
        date: 1700000000,
        text: 'hello',
      })).toBe(true);
    });

    it('accepts a message without text (e.g., photo)', () => {
      expect(Value.Check(TelegramMessageSchema, {
        message_id: 1,
        chat: { id: 999, type: 'private' },
        date: 1700000000,
      })).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TelegramUpdateSchema
  // -------------------------------------------------------------------------
  describe('TelegramUpdateSchema', () => {
    it('accepts a valid update with message', () => {
      expect(Value.Check(TelegramUpdateSchema, {
        update_id: 100,
        message: {
          message_id: 1,
          chat: { id: 999, type: 'private' },
          date: 1700000000,
          text: '/start',
        },
      })).toBe(true);
    });

    it('accepts an update without message (e.g., callback query)', () => {
      expect(Value.Check(TelegramUpdateSchema, { update_id: 100 })).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TelegramGetUpdatesResponseSchema
  // -------------------------------------------------------------------------
  describe('TelegramGetUpdatesResponseSchema', () => {
    it('accepts a valid response', () => {
      expect(Value.Check(TelegramGetUpdatesResponseSchema, {
        ok: true,
        result: [{ update_id: 1 }],
      })).toBe(true);
    });

    it('accepts an empty result array', () => {
      expect(Value.Check(TelegramGetUpdatesResponseSchema, {
        ok: true,
        result: [],
      })).toBe(true);
    });

    it('rejects missing ok field', () => {
      expect(Value.Check(TelegramGetUpdatesResponseSchema, {
        result: [],
      })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // TelegramSendMessageResponseSchema
  // -------------------------------------------------------------------------
  describe('TelegramSendMessageResponseSchema', () => {
    it('accepts a valid response', () => {
      expect(Value.Check(TelegramSendMessageResponseSchema, {
        ok: true,
        result: {
          message_id: 1,
          chat: { id: 999, type: 'private' },
          date: 1700000000,
          text: 'hello',
        },
      })).toBe(true);
    });

    it('accepts a response without result', () => {
      expect(Value.Check(TelegramSendMessageResponseSchema, {
        ok: false,
      })).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PatientSessionSchema
  // -------------------------------------------------------------------------
  describe('PatientSessionSchema', () => {
    it('accepts a minimal session', () => {
      expect(Value.Check(PatientSessionSchema, {
        chat_id: 999,
        state: 'START',
        created_at: '2026-01-01T00:00:00.000Z',
      })).toBe(true);
    });

    it('accepts a full session', () => {
      expect(Value.Check(PatientSessionSchema, {
        chat_id: 999,
        state: 'ENROLLED',
        patient_name: 'Alice',
        consented: true,
        patient_id: 'abc-123',
        public_key: 'base64key==',
        created_at: '2026-01-01T00:00:00.000Z',
      })).toBe(true);
    });

    it('rejects an invalid state', () => {
      expect(Value.Check(PatientSessionSchema, {
        chat_id: 999,
        state: 'UNKNOWN',
        created_at: '2026-01-01T00:00:00.000Z',
      })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // StateTransitionSchema
  // -------------------------------------------------------------------------
  describe('StateTransitionSchema', () => {
    it('accepts a valid transition', () => {
      expect(Value.Check(StateTransitionSchema, {
        from: 'START',
        to: 'AWAITING_NAME',
        trigger: '/start',
        chat_id: 999,
        timestamp: '2026-01-01T00:00:00.000Z',
      })).toBe(true);
    });

    it('rejects a transition with invalid state', () => {
      expect(Value.Check(StateTransitionSchema, {
        from: 'INVALID',
        to: 'AWAITING_NAME',
        trigger: '/start',
        chat_id: 999,
        timestamp: '2026-01-01T00:00:00.000Z',
      })).toBe(false);
    });
  });
});
