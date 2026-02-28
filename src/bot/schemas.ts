/**
 * TypeBox schemas for Telegram bot message payloads and state transitions.
 *
 * All data validation at the bot boundary uses these schemas.
 * Zero runtime npm dependencies -- uses TypeBox (devDependency, bundled by tsdown).
 */

import { Type, type Static } from '@sinclair/typebox';

// ---------------------------------------------------------------------------
// Onboarding State Machine
// ---------------------------------------------------------------------------

/** All possible states in the onboarding flow. */
export const OnboardingStateSchema = Type.Union([
  Type.Literal('START'),
  Type.Literal('AWAITING_NAME'),
  Type.Literal('AWAITING_CONSENT'),
  Type.Literal('ENROLLED'),
  Type.Literal('DECLINED'),
]);

export type OnboardingState = Static<typeof OnboardingStateSchema>;

// ---------------------------------------------------------------------------
// Telegram Bot API Payloads (subset used by onboarding)
// ---------------------------------------------------------------------------

/** Telegram User object (subset). */
export const TelegramUserSchema = Type.Object({
  id: Type.Number({ description: 'Telegram user ID' }),
  is_bot: Type.Boolean(),
  first_name: Type.String(),
  last_name: Type.Optional(Type.String()),
  username: Type.Optional(Type.String()),
});

export type TelegramUser = Static<typeof TelegramUserSchema>;

/** Telegram Chat object (subset). */
export const TelegramChatSchema = Type.Object({
  id: Type.Number({ description: 'Telegram chat ID' }),
  type: Type.String(),
});

export type TelegramChat = Static<typeof TelegramChatSchema>;

/** Telegram Message object (subset). */
export const TelegramMessageSchema = Type.Object({
  message_id: Type.Number(),
  from: Type.Optional(TelegramUserSchema),
  chat: TelegramChatSchema,
  date: Type.Number(),
  text: Type.Optional(Type.String()),
});

export type TelegramMessage = Static<typeof TelegramMessageSchema>;

/** Telegram Update object (subset). */
export const TelegramUpdateSchema = Type.Object({
  update_id: Type.Number(),
  message: Type.Optional(TelegramMessageSchema),
});

export type TelegramUpdate = Static<typeof TelegramUpdateSchema>;

/** Telegram getUpdates response. */
export const TelegramGetUpdatesResponseSchema = Type.Object({
  ok: Type.Boolean(),
  result: Type.Array(TelegramUpdateSchema),
});

export type TelegramGetUpdatesResponse = Static<typeof TelegramGetUpdatesResponseSchema>;

/** Telegram sendMessage response. */
export const TelegramSendMessageResponseSchema = Type.Object({
  ok: Type.Boolean(),
  result: Type.Optional(TelegramMessageSchema),
});

export type TelegramSendMessageResponse = Static<typeof TelegramSendMessageResponseSchema>;

// ---------------------------------------------------------------------------
// Patient Session (per-chat onboarding state)
// ---------------------------------------------------------------------------

/** Per-chat onboarding session tracked by the bot. */
export const PatientSessionSchema = Type.Object({
  chat_id: Type.Number({ description: 'Telegram chat ID' }),
  state: OnboardingStateSchema,
  patient_name: Type.Optional(Type.String()),
  consented: Type.Optional(Type.Boolean()),
  patient_id: Type.Optional(Type.String({ description: 'Generated UUID after enrollment' })),
  public_key: Type.Optional(Type.String({ description: 'Base64-encoded Ed25519 public key' })),
  created_at: Type.String({ description: 'ISO 8601 timestamp' }),
});

export type PatientSession = Static<typeof PatientSessionSchema>;

// ---------------------------------------------------------------------------
// State Transition Schema
// ---------------------------------------------------------------------------

/** Describes a valid state transition triggered by user input. */
export const StateTransitionSchema = Type.Object({
  from: OnboardingStateSchema,
  to: OnboardingStateSchema,
  trigger: Type.String({ description: 'What caused the transition (e.g., /start, name, consent_yes)' }),
  chat_id: Type.Number(),
  timestamp: Type.String({ description: 'ISO 8601' }),
});

export type StateTransition = Static<typeof StateTransitionSchema>;
