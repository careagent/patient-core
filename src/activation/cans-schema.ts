/**
 * Patient CANS.md TypeBox schema -- full implementation.
 *
 * CANS.md is a configuration file that tells the agent HOW to behave.
 * It contains NO personal health information and NO personally identifiable
 * information. All health data resides in the patient chart (Phase 4).
 *
 * Required fields: schema_version, identity_type, consent_posture, health_literacy_level
 * Optional fields: providers, autonomy, communication, advocacy
 *
 * The identity_type discriminator MUST be 'patient' for activation.
 */

import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/** Trust level union: pending (handshake), active, suspended, revoked */
export const TrustLevelSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('active'),
  Type.Literal('suspended'),
  Type.Literal('revoked'),
]);

/** Provider trust list entry with NPI, role, trust level, and metadata */
export const TrustListEntrySchema = Type.Object({
  npi: Type.String({ description: '10-digit NPI identifier' }),
  role: Type.String({ description: 'Clinical role (primary_care, specialist, pharmacist, etc.)' }),
  trust_level: TrustLevelSchema,
  provider_name: Type.String({ description: 'Human-readable display name' }),
  organization: Type.Optional(Type.String({ description: 'Practice or institution name' })),
  last_changed: Type.String({ description: 'ISO 8601 timestamp of last trust_level change' }),
});

/** Autonomy tier for a single action type */
const AutonomyTierSchema = Type.Union([
  Type.Literal('supervised'),
  Type.Literal('autonomous'),
  Type.Literal('manual'),
]);

/** Per-action-type autonomy configuration */
const AutonomySchema = Type.Object({
  share: AutonomyTierSchema,
  request: AutonomyTierSchema,
  review: AutonomyTierSchema,
});

/** Communication preferences */
const CommunicationSchema = Type.Object({
  preferred_language: Type.Optional(Type.String()),
  contact_hours: Type.Optional(Type.String()),
});

/** Advocacy boundaries */
const AdvocacySchema = Type.Object({
  enabled: Type.Optional(Type.Boolean()),
});

// ---------------------------------------------------------------------------
// Root CANS Schema
// ---------------------------------------------------------------------------

/**
 * Full Patient CANS schema -- configuration file, NOT a clinical record.
 *
 * No health data fields (PCANS-06 redirected to Phase 4 chart).
 * identity_type: Type.Literal('patient') is the discriminator (PCANS-01).
 * Four trust levels: pending|active|suspended|revoked (PCANS-07).
 * Providers array is optional; empty array is valid (PCANS-07).
 */
export const CANSSchema = Type.Object({
  schema_version: Type.String({ description: 'CANS schema version, e.g. "1.0"' }),
  identity_type: Type.Literal('patient', { description: 'Discriminator: must be "patient" for activation' }),
  consent_posture: Type.Union([
    Type.Literal('deny'),
    Type.Literal('allow'),
  ], { description: 'Default sharing posture; deny = nothing leaves workspace without explicit consent' }),
  health_literacy_level: Type.Union([
    Type.Literal('simplified'),
    Type.Literal('standard'),
    Type.Literal('detailed'),
  ], { description: 'Preferred explanation depth for agent communications' }),
  providers: Type.Optional(Type.Array(TrustListEntrySchema)),
  autonomy: Type.Optional(AutonomySchema),
  communication: Type.Optional(CommunicationSchema),
  advocacy: Type.Optional(AdvocacySchema),
});

/** Typed CANS document derived from the schema */
export type CANSDocument = Static<typeof CANSSchema>;

/**
 * Validate and decode a parsed object against the CANS schema.
 * Throws a descriptive Error on validation failure.
 * Returns a typed CANSDocument on success.
 *
 * For CLI use (patientagent validate) -- call in a try/catch to get the message.
 * The gate uses Value.Check/Value.Errors directly and does not call this.
 */
export function validateCANS(data: unknown): CANSDocument {
  if (!Value.Check(CANSSchema, data)) {
    const errors = [...Value.Errors(CANSSchema, data)].map(e => `  ${e.path}: ${e.message}`);
    throw new Error(`CANS validation failed:\n${errors.join('\n')}`);
  }
  return data as CANSDocument;
}
