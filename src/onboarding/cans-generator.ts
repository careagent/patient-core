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
}

/**
 * Generate CANS.md content from onboarding data.
 *
 * Creates a minimal CANS.md with deny-by-default consent posture.
 * The generated file passes the activation gate's 5-step pipeline.
 */
export function generateCANS(data: CANSGeneratorInput): string {
  const frontmatter = {
    schema_version: '1.0',
    identity_type: 'patient',
    consent_posture: 'deny',
    health_literacy_level: 'standard',
  };

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
