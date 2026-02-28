/**
 * Onboarding state machine -- pure state transitions with no side effects.
 *
 * State flow:
 *   START -> AWAITING_NAME -> AWAITING_CONSENT -> ENROLLED | DECLINED
 *
 * The state machine is a pure function: given a session and input text,
 * it returns the next state and response message. Side effects (keypair
 * generation, chart writes, CANS.md generation) are handled by the caller.
 */

import type { OnboardingState, PatientSession } from './schemas.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CONSENT_TEXT =
  'CareAgent is a patient-governed clinical agent that acts on your behalf. ' +
  'By consenting, you agree to:\n\n' +
  '1. Allow CareAgent to manage your care network connections\n' +
  '2. Store your public key and name in an encrypted vault\n' +
  '3. Enforce deny-by-default consent on all data sharing\n\n' +
  'Your health data is never stored in this configuration. ' +
  'You can revoke consent at any time.\n\n' +
  'Do you consent? (yes/no)';

export const WELCOME_MESSAGE =
  'Welcome to CareAgent! I will help you set up your patient agent.\n\n' +
  'What is your name?';

export const ENROLLMENT_MESSAGE =
  'You are now enrolled in CareAgent! Your patient agent has been created ' +
  'with deny-by-default consent posture.\n\n' +
  'To pair with a provider, enter their 10-digit NPI number.';

export const DECLINE_MESSAGE =
  'Understood. Your consent has not been recorded. ' +
  'You can restart the onboarding process at any time by sending /start.';

export const ALREADY_ENROLLED_MESSAGE =
  'You are already enrolled. To pair with a provider, enter their 10-digit NPI number.';

export const INVALID_CONSENT_MESSAGE =
  'Please respond with "yes" or "no" to the consent question.';

export const INVALID_NAME_MESSAGE =
  'Please enter a valid name (at least 1 character, letters and spaces only).';

export const PAIRING_SEARCH_MESSAGE =
  'Searching for provider with NPI {npi}...';

export const PAIRING_STUB_MESSAGE = PAIRING_SEARCH_MESSAGE;

// ---------------------------------------------------------------------------
// Input Parsing
// ---------------------------------------------------------------------------

/** Check if the input is the /start command. */
export function isStartCommand(text: string): boolean {
  return text.trim().toLowerCase() === '/start';
}

/** Check if the input is an affirmative consent response. */
export function isConsentYes(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === 'yes' || normalized === 'y';
}

/** Check if the input is a negative consent response. */
export function isConsentNo(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === 'no' || normalized === 'n';
}

/** Validate a patient name (non-empty, letters and spaces, reasonable length). */
export function isValidName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;
  return /^[\p{L}\p{M}' -]+$/u.test(trimmed);
}

/** Check if the input looks like an NPI (10 digits). */
export function isNpi(text: string): boolean {
  return /^\d{10}$/.test(text.trim());
}

// ---------------------------------------------------------------------------
// State Transition Result
// ---------------------------------------------------------------------------

export interface TransitionResult {
  nextState: OnboardingState;
  response: string;
  /** Set when transitioning to ENROLLED -- signals caller to run side effects. */
  enrollmentData?: {
    patientName: string;
  };
  /** Set when an enrolled patient enters an NPI -- signals caller to run discovery. */
  discoveryNpi?: string;
}

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------

/**
 * Process a text input against the current session state.
 *
 * Returns the next state and the response message to send.
 * Side effects (keypair generation, chart writes) are NOT performed here --
 * the caller handles them based on enrollmentData.
 */
export function processInput(session: PatientSession, text: string): TransitionResult {
  const input = text.trim();

  // /start always resets to the beginning (unless already enrolled)
  if (isStartCommand(input)) {
    if (session.state === 'ENROLLED') {
      return { nextState: 'ENROLLED', response: ALREADY_ENROLLED_MESSAGE };
    }
    return { nextState: 'AWAITING_NAME', response: WELCOME_MESSAGE };
  }

  switch (session.state) {
    case 'START':
      // Only /start moves out of START -- handled above
      return { nextState: 'START', response: 'Send /start to begin onboarding.' };

    case 'AWAITING_NAME':
      if (!isValidName(input)) {
        return { nextState: 'AWAITING_NAME', response: INVALID_NAME_MESSAGE };
      }
      return {
        nextState: 'AWAITING_CONSENT',
        response: `Thank you, ${input.trim()}.\n\n${CONSENT_TEXT}`,
      };

    case 'AWAITING_CONSENT':
      if (isConsentYes(input)) {
        return {
          nextState: 'ENROLLED',
          response: ENROLLMENT_MESSAGE,
          enrollmentData: { patientName: session.patient_name! },
        };
      }
      if (isConsentNo(input)) {
        return { nextState: 'DECLINED', response: DECLINE_MESSAGE };
      }
      return { nextState: 'AWAITING_CONSENT', response: INVALID_CONSENT_MESSAGE };

    case 'ENROLLED':
      if (isNpi(input)) {
        return {
          nextState: 'ENROLLED',
          response: PAIRING_SEARCH_MESSAGE.replace('{npi}', input.trim()),
          discoveryNpi: input.trim(),
        };
      }
      return {
        nextState: 'ENROLLED',
        response: 'To pair with a provider, enter their 10-digit NPI number.',
      };

    case 'DECLINED':
      // Allow restart from DECLINED via /start (handled above)
      return {
        nextState: 'DECLINED',
        response: 'You can restart onboarding by sending /start.',
      };

    default:
      return { nextState: 'START', response: 'Send /start to begin onboarding.' };
  }
}
