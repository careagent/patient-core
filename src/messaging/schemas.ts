/**
 * Messaging TypeBox schemas — defines all message types for the patient-side
 * WebSocket messaging system.
 *
 * Covers:
 * - Incoming signed message envelope (provider -> patient)
 * - Message acknowledgment (patient -> provider)
 * - WebSocket authentication token
 * - Connection state tracking
 *
 * Provider messages arrive as SignedMessageEnvelope objects from provider-core.
 * The patient validates, checks consent, encrypts, stores, and sends an ack/nack.
 */

import { Type, type Static } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

// ---------------------------------------------------------------------------
// Clinical Message Types (compatible with provider-core)
// ---------------------------------------------------------------------------

export const ClinicalSummarySchema = Type.Object({
  type: Type.Literal('clinical_summary'),
  encounter_id: Type.Optional(Type.String()),
  summary: Type.String({ minLength: 1 }),
  diagnoses: Type.Optional(Type.Array(Type.Object({
    code: Type.String(),
    system: Type.Optional(Type.String()),
    display: Type.String(),
  }))),
  medications: Type.Optional(Type.Array(Type.Object({
    name: Type.String(),
    dosage: Type.Optional(Type.String()),
    frequency: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
  }))),
  follow_up: Type.Optional(Type.String()),
  provider_npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_name: Type.String({ minLength: 1 }),
});

export type ClinicalSummary = Static<typeof ClinicalSummarySchema>;

export const AppointmentReminderSchema = Type.Object({
  type: Type.Literal('appointment_reminder'),
  appointment_id: Type.Optional(Type.String()),
  scheduled_at: Type.String(),
  location: Type.Optional(Type.String()),
  provider_npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_name: Type.String({ minLength: 1 }),
  reason: Type.Optional(Type.String()),
  instructions: Type.Optional(Type.String()),
});

export type AppointmentReminder = Static<typeof AppointmentReminderSchema>;

export const CarePlanUpdateSchema = Type.Object({
  type: Type.Literal('care_plan_update'),
  care_plan_id: Type.Optional(Type.String()),
  summary: Type.String({ minLength: 1 }),
  goals: Type.Optional(Type.Array(Type.Object({
    description: Type.String(),
    status: Type.Optional(Type.String()),
    target_date: Type.Optional(Type.String()),
  }))),
  interventions: Type.Optional(Type.Array(Type.Object({
    description: Type.String(),
    assigned_to: Type.Optional(Type.String()),
    frequency: Type.Optional(Type.String()),
  }))),
  provider_npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_name: Type.String({ minLength: 1 }),
});

export type CarePlanUpdate = Static<typeof CarePlanUpdateSchema>;

export const ClinicalMessageSchema = Type.Union([
  ClinicalSummarySchema,
  AppointmentReminderSchema,
  CarePlanUpdateSchema,
]);

export type ClinicalMessage = Static<typeof ClinicalMessageSchema>;

// ---------------------------------------------------------------------------
// Signed Message Envelope (provider -> patient)
// ---------------------------------------------------------------------------

/** Incoming signed message envelope from provider-core. */
export const SignedMessageEnvelopeSchema = Type.Object({
  version: Type.Literal('1'),
  message_id: Type.String({ description: 'UUIDv4 message identifier' }),
  correlation_id: Type.String({ description: 'Bilateral correlation ID' }),
  timestamp: Type.String({ description: 'ISO 8601 send timestamp' }),
  sender_public_key: Type.String({ description: 'base64url-encoded Ed25519 public key' }),
  patient_agent_id: Type.String({ description: 'Target patient agent' }),
  payload: ClinicalMessageSchema,
  signature: Type.String({ description: 'base64url-encoded Ed25519 signature over canonical payload' }),
});

export type SignedMessageEnvelope = Static<typeof SignedMessageEnvelopeSchema>;

export const SignedMessageEnvelopeValidator = TypeCompiler.Compile(SignedMessageEnvelopeSchema);

// ---------------------------------------------------------------------------
// Message Acknowledgment (patient -> provider)
// ---------------------------------------------------------------------------

export const MessageAckStatusSchema = Type.Union([
  Type.Literal('accepted'),
  Type.Literal('rejected'),
]);

export type MessageAckStatus = Static<typeof MessageAckStatusSchema>;

export const RejectionReasonSchema = Type.Union([
  Type.Literal('invalid_signature'),
  Type.Literal('unknown_sender'),
  Type.Literal('consent_required'),
  Type.Literal('schema_validation_failed'),
  Type.Literal('storage_error'),
  Type.Literal('internal_error'),
]);

export type RejectionReason = Static<typeof RejectionReasonSchema>;

export const MessageAckSchema = Type.Object({
  type: Type.Literal('message_ack'),
  correlation_id: Type.String({ description: 'Same correlation ID as the incoming message' }),
  status: MessageAckStatusSchema,
  reason: Type.Optional(RejectionReasonSchema),
  timestamp: Type.String({ description: 'ISO 8601 ack timestamp' }),
  signature: Type.Optional(Type.String({ description: 'Patient signs the ack (base64url)' })),
});

export type MessageAck = Static<typeof MessageAckSchema>;

export const MessageAckValidator = TypeCompiler.Compile(MessageAckSchema);

// ---------------------------------------------------------------------------
// WebSocket Authentication Token
// ---------------------------------------------------------------------------

/** Token presented by a provider when initiating a WebSocket connection. */
export const ConnectionAuthTokenSchema = Type.Object({
  type: Type.Literal('connection_auth'),
  provider_npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_entity_id: Type.String(),
  timestamp: Type.String({ description: 'ISO 8601 token creation time' }),
  patient_agent_id: Type.String(),
  signature: Type.String({ description: 'base64url-encoded Ed25519 signature' }),
  sender_public_key: Type.String({ description: 'base64url-encoded Ed25519 public key' }),
});

export type ConnectionAuthToken = Static<typeof ConnectionAuthTokenSchema>;

export const ConnectionAuthTokenValidator = TypeCompiler.Compile(ConnectionAuthTokenSchema);

// ---------------------------------------------------------------------------
// Known Provider (from handshake records)
// ---------------------------------------------------------------------------

/** A provider record from the handshake/trust list. */
export const KnownProviderSchema = Type.Object({
  npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_name: Type.String(),
  public_key: Type.String({ description: 'base64url-encoded Ed25519 public key' }),
  trust_level: Type.Union([
    Type.Literal('pending'),
    Type.Literal('active'),
    Type.Literal('suspended'),
    Type.Literal('revoked'),
  ]),
  connection_id: Type.Optional(Type.String()),
  neuron_endpoint: Type.Optional(Type.String()),
});

export type KnownProvider = Static<typeof KnownProviderSchema>;

// ---------------------------------------------------------------------------
// Encrypted Vault Entry (for storing messages at rest)
// ---------------------------------------------------------------------------

export const EncryptedPayloadSchema = Type.Object({
  ciphertext: Type.String({ description: 'Base64-encoded AES-256-GCM ciphertext' }),
  iv: Type.String({ description: 'Base64-encoded 12-byte IV' }),
  auth_tag: Type.String({ description: 'Base64-encoded 16-byte GCM authentication tag' }),
});

export type EncryptedPayload = Static<typeof EncryptedPayloadSchema>;

/** The structure stored in the patient chart vault for each received message. */
export const MessageLedgerEntrySchema = Type.Object({
  type: Type.Literal('clinical_message_received'),
  correlation_id: Type.String(),
  sender_npi: Type.String(),
  sender_name: Type.String(),
  message_type: Type.String({ description: 'clinical_summary | appointment_reminder | care_plan_update' }),
  received_at: Type.String({ description: 'ISO 8601' }),
  sent_at: Type.String({ description: 'ISO 8601 from the original message timestamp' }),
  encrypted_payload: EncryptedPayloadSchema,
  signature_verified: Type.Literal(true),
  consent_granted: Type.Literal(true),
});

export type MessageLedgerEntry = Static<typeof MessageLedgerEntrySchema>;

// ---------------------------------------------------------------------------
// WebSocket Server Configuration
// ---------------------------------------------------------------------------

export const MessagingServerConfigSchema = Type.Object({
  port: Type.Number({ minimum: 0, maximum: 65535 }),
  host: Type.Optional(Type.String()),
  patientAgentId: Type.String(),
});

export type MessagingServerConfig = Static<typeof MessagingServerConfigSchema>;
