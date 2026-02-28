/**
 * Bot module barrel export.
 *
 * Re-exports all public types, schemas, and factories for the
 * Telegram onboarding bot.
 */

// Schemas
export {
  OnboardingStateSchema,
  TelegramUserSchema,
  TelegramChatSchema,
  TelegramMessageSchema,
  TelegramUpdateSchema,
  TelegramGetUpdatesResponseSchema,
  TelegramSendMessageResponseSchema,
  PatientSessionSchema,
  StateTransitionSchema,
} from './schemas.js';

export type {
  OnboardingState,
  TelegramUser,
  TelegramChat,
  TelegramMessage,
  TelegramUpdate,
  TelegramGetUpdatesResponse,
  TelegramSendMessageResponse,
  PatientSession,
  StateTransition,
} from './schemas.js';

// Telegram client
export {
  createTelegramTransport,
  createMockTransport,
} from './telegram-client.js';

export type {
  TelegramTransport,
  MockTransportRecord,
} from './telegram-client.js';

// State machine
export {
  processInput,
  isStartCommand,
  isConsentYes,
  isConsentNo,
  isValidName,
  isNpi,
  CONSENT_TEXT,
  WELCOME_MESSAGE,
  ENROLLMENT_MESSAGE,
  DECLINE_MESSAGE,
  ALREADY_ENROLLED_MESSAGE,
  INVALID_CONSENT_MESSAGE,
  INVALID_NAME_MESSAGE,
  PAIRING_STUB_MESSAGE,
  PAIRING_SEARCH_MESSAGE,
} from './state-machine.js';

export type { TransitionResult } from './state-machine.js';

// Keypair generation
export { generatePatientKeypair } from './keypair.js';
export type { PatientKeypair } from './keypair.js';

// Onboarding bot
export { createOnboardingBot } from './onboarding-bot.js';
export type { OnboardingBotConfig, OnboardingBot } from './onboarding-bot.js';
