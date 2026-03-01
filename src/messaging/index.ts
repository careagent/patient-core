/**
 * Messaging module barrel exports.
 *
 * Patient-side WebSocket messaging system for receiving clinical messages
 * from provider agents. Includes schemas, crypto, pipeline, and server.
 */

// Schemas
export {
  ClinicalSummarySchema,
  AppointmentReminderSchema,
  CarePlanUpdateSchema,
  ClinicalMessageSchema,
  SignedMessageEnvelopeSchema,
  SignedMessageEnvelopeValidator,
  MessageAckStatusSchema,
  RejectionReasonSchema,
  MessageAckSchema,
  MessageAckValidator,
  ConnectionAuthTokenSchema,
  ConnectionAuthTokenValidator,
  KnownProviderSchema,
  EncryptedPayloadSchema,
  MessageLedgerEntrySchema,
  MessagingServerConfigSchema,
} from './schemas.js';

export type {
  ClinicalSummary,
  AppointmentReminder,
  CarePlanUpdate,
  ClinicalMessage,
  SignedMessageEnvelope,
  MessageAckStatus,
  RejectionReason,
  MessageAck,
  ConnectionAuthToken,
  KnownProvider,
  EncryptedPayload,
  MessageLedgerEntry,
  MessagingServerConfig,
} from './schemas.js';

// Crypto
export {
  canonicalizePayload,
  verifyMessageSignature,
  signAck,
  encryptPayload,
  decryptPayload,
  generateEncryptionKey,
} from './crypto.js';

// Pipeline
export { createMessagePipeline } from './pipeline.js';
export type { MessagePipelineConfig, PipelineResult } from './pipeline.js';

// Server
export { createMessagingServer } from './server.js';
export type { MessagingServer, MessagingServerDeps } from './server.js';
