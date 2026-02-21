/**
 * Patient CANS.md TypeBox schema -- placeholder for Phase 2.
 *
 * Patient-core's CANS document includes an identity_type discriminator
 * to distinguish patient CANS.md from provider CANS.md. The full schema
 * will be defined in Phase 2 when the patient-specific fields are designed.
 */

import { Type, type Static } from '@sinclair/typebox';

/**
 * Placeholder CANS document schema.
 * Phase 2 will replace this with the complete patient CANS schema.
 */
export const CANSSchema = Type.Object({
  version: Type.String({ description: 'CANS.md schema version' }),
  identity_type: Type.Literal('patient', { description: 'Discriminator for patient vs provider CANS' }),
});

/** Placeholder CANS document type -- replaced in Phase 2. */
export type CANSDocument = Static<typeof CANSSchema>;

/**
 * Validate a parsed object against the CANS schema.
 * @throws Error - Always throws in Phase 1 (not yet implemented).
 */
export function validateCANS(_data: unknown): CANSDocument {
  throw new Error('CANS schema validation not yet implemented (Phase 2)');
}
