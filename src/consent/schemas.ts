/**
 * Consent engine TypeBox schemas -- defines all consent-related data types.
 *
 * Consent actions, postures, records, decisions, and prompts are all
 * validated at boundaries through these schemas. Types are derived
 * from schemas via Static<typeof Schema>.
 */

import { Type, type Static } from '@sinclair/typebox';

// ---------------------------------------------------------------------------
// Consent Action
// ---------------------------------------------------------------------------

/** Action types that require consent checks. */
export const ConsentActionSchema = Type.Union([
  Type.Literal('data:read'),
  Type.Literal('data:write'),
  Type.Literal('message:send'),
  Type.Literal('message:receive'),
  Type.Literal('acl:grant'),
  Type.Literal('acl:revoke'),
  Type.Literal('handshake:initiate'),
  Type.Literal('handshake:accept'),
]);

export type ConsentAction = Static<typeof ConsentActionSchema>;

// ---------------------------------------------------------------------------
// Consent Posture
// ---------------------------------------------------------------------------

/**
 * Patient's default consent posture:
 * - deny-all: deny everything, prompt for each action
 * - allow-trusted: auto-allow for trust-listed providers with active status
 * - custom: per-action rules defined by the patient
 */
export const ConsentPostureSchema = Type.Union([
  Type.Literal('deny-all'),
  Type.Literal('allow-trusted'),
  Type.Literal('custom'),
]);

export type ConsentPosture = Static<typeof ConsentPostureSchema>;

// ---------------------------------------------------------------------------
// Health Literacy Level (for prompt generation)
// ---------------------------------------------------------------------------

export const HealthLiteracyLevelSchema = Type.Union([
  Type.Literal('basic'),
  Type.Literal('intermediate'),
  Type.Literal('advanced'),
]);

export type HealthLiteracyLevel = Static<typeof HealthLiteracyLevelSchema>;

// ---------------------------------------------------------------------------
// Consent Record
// ---------------------------------------------------------------------------

/** A stored consent decision. */
export const ConsentRecordSchema = Type.Object({
  id: Type.String({ description: 'Unique consent record ID (UUID)' }),
  action: ConsentActionSchema,
  actorId: Type.String({ description: 'Who is performing/requesting the action' }),
  decision: Type.Union([Type.Literal('allow'), Type.Literal('deny')]),
  reason: Type.Optional(Type.String({ description: 'Human-readable reason for the decision' })),
  correlationId: Type.String({ description: 'Bilateral correlation ID linking patient and provider audit trails' }),
  createdAt: Type.String({ description: 'ISO 8601 timestamp of the consent decision' }),
  expiresAt: Type.Optional(Type.String({ description: 'ISO 8601 timestamp when this consent expires' })),
  revoked: Type.Boolean({ description: 'Whether this consent has been explicitly revoked' }),
  revokedAt: Type.Optional(Type.String({ description: 'ISO 8601 timestamp when consent was revoked' })),
  literacyLevel: Type.Optional(HealthLiteracyLevelSchema),
});

export type ConsentRecord = Static<typeof ConsentRecordSchema>;

// ---------------------------------------------------------------------------
// Consent Decision (returned by check())
// ---------------------------------------------------------------------------

/** Result of a consent check. */
export const ConsentDecisionSchema = Type.Object({
  allowed: Type.Boolean(),
  reason: Type.String(),
  consentId: Type.Optional(Type.String({ description: 'ID of the matching consent record, if any' })),
  correlationId: Type.Optional(Type.String({ description: 'Bilateral correlation ID' })),
  requiresPrompt: Type.Boolean({ description: 'True if consent prompt should be shown to patient' }),
});

export type ConsentDecision = Static<typeof ConsentDecisionSchema>;

// ---------------------------------------------------------------------------
// Consent Prompt
// ---------------------------------------------------------------------------

/** A human-readable consent prompt for the patient. */
export const ConsentPromptSchema = Type.Object({
  action: ConsentActionSchema,
  actorId: Type.String(),
  literacyLevel: HealthLiteracyLevelSchema,
  text: Type.String({ description: 'The human-readable consent prompt text' }),
  correlationId: Type.String({ description: 'Bilateral correlation ID for this consent decision' }),
});

export type ConsentPrompt = Static<typeof ConsentPromptSchema>;

// ---------------------------------------------------------------------------
// Custom Rule (for 'custom' posture)
// ---------------------------------------------------------------------------

/** A per-action custom rule for the custom consent posture. */
export const CustomConsentRuleSchema = Type.Object({
  action: ConsentActionSchema,
  actorId: Type.Optional(Type.String({ description: 'If set, rule applies only to this actor' })),
  decision: Type.Union([Type.Literal('allow'), Type.Literal('deny')]),
});

export type CustomConsentRule = Static<typeof CustomConsentRuleSchema>;

// ---------------------------------------------------------------------------
// Consent Engine Configuration
// ---------------------------------------------------------------------------

/** Configuration for initializing the consent engine. */
export const ConsentEngineConfigSchema = Type.Object({
  posture: ConsentPostureSchema,
  trustList: Type.Optional(Type.Array(Type.Object({
    npi: Type.String(),
    trust_level: Type.Union([
      Type.Literal('pending'),
      Type.Literal('active'),
      Type.Literal('suspended'),
      Type.Literal('revoked'),
    ]),
    provider_name: Type.String(),
  }))),
  customRules: Type.Optional(Type.Array(CustomConsentRuleSchema)),
  defaultLiteracyLevel: Type.Optional(HealthLiteracyLevelSchema),
});

export type ConsentEngineConfig = Static<typeof ConsentEngineConfigSchema>;
