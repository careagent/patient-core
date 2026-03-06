/**
 * CANS.md generator -- generates CANS.md from onboarding data.
 *
 * Mirrors provider-core's cans-generator.ts. Generates the CANS.md
 * file from interview results or bot onboarding data.
 *
 * The generated CANS.md uses YAML frontmatter with identity_type: 'patient'
 * as the discriminator for the activation gate.
 */

import { stringifyYAML } from '../vendor/yaml/index.js';

/** Data required to generate a patient CANS.md. */
export interface CANSGeneratorInput {
  patient_id: string;
  public_key: string;
  /** Override consent posture (default: 'deny'). */
  consent_posture?: string;
  /** Health literacy level from onboarding (default: 'standard'). */
  health_literacy_level?: string;
  /** Preferred language from onboarding (default: 'English'). */
  preferred_language?: string;
}

/**
 * Generate CANS.md content from onboarding data.
 *
 * Creates a CANS.md with preferences from the onboarding questionnaire.
 * The generated file passes the activation gate's 5-step pipeline.
 * PHI is never stored in CANS.md — only non-PHI preferences.
 */
export function generateCANS(data: CANSGeneratorInput): string {
  const frontmatter: Record<string, unknown> = {
    schema_version: '1.0',
    identity_type: 'patient',
    consent_posture: data.consent_posture ?? 'deny',
    health_literacy_level: data.health_literacy_level ?? 'standard',
  };

  if (data.preferred_language) {
    frontmatter['preferred_language'] = data.preferred_language;
  }

  const yaml = stringifyYAML(frontmatter).trim();
  const now = new Date().toISOString();

  return [
    '---',
    yaml,
    '---',
    '',
    '# Patient CareAgent Configuration',
    '',
    `Patient ID: ${data.patient_id}`,
    `Public Key: ${data.public_key}`,
    `Onboarded: ${now}`,
    '',
    '## Consent Posture',
    '',
    'deny-by-default: No data leaves this workspace without explicit consent.',
    '',
  ].join('\n');
}
