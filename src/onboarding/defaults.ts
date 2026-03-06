/**
 * Default values for patient onboarding fields.
 */

/** Get default values for onboarding preferences. */
export function getDefaults(): Record<string, unknown> {
  return {
    consent_posture: 'deny',
    health_literacy_level: 'standard',
    preferred_language: 'English',
  };
}
