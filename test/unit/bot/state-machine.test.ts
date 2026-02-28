/**
 * Tests for onboarding state machine.
 *
 * The state machine is pure -- given a session and input, it returns
 * next state and response message. No side effects.
 */

import { describe, it, expect } from 'vitest';
import {
  processInput,
  isStartCommand,
  isConsentYes,
  isConsentNo,
  isValidName,
  isNpi,
  WELCOME_MESSAGE,
  ENROLLMENT_MESSAGE,
  DECLINE_MESSAGE,
  ALREADY_ENROLLED_MESSAGE,
  INVALID_CONSENT_MESSAGE,
  INVALID_NAME_MESSAGE,
  PAIRING_STUB_MESSAGE,
} from '../../../src/bot/state-machine.js';
import type { PatientSession } from '../../../src/bot/schemas.js';

// Helper: create a session in a specific state
function makeSession(state: PatientSession['state'], overrides?: Partial<PatientSession>): PatientSession {
  return {
    chat_id: 999,
    state,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Input Parsing Helpers', () => {
  describe('isStartCommand', () => {
    it('recognizes /start', () => {
      expect(isStartCommand('/start')).toBe(true);
    });

    it('recognizes /start with whitespace', () => {
      expect(isStartCommand('  /start  ')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isStartCommand('/START')).toBe(true);
    });

    it('rejects non-start commands', () => {
      expect(isStartCommand('/help')).toBe(false);
      expect(isStartCommand('start')).toBe(false);
      expect(isStartCommand('hello')).toBe(false);
    });
  });

  describe('isConsentYes', () => {
    it('recognizes yes', () => {
      expect(isConsentYes('yes')).toBe(true);
      expect(isConsentYes('YES')).toBe(true);
      expect(isConsentYes('Yes')).toBe(true);
      expect(isConsentYes('y')).toBe(true);
      expect(isConsentYes('Y')).toBe(true);
    });

    it('rejects non-yes', () => {
      expect(isConsentYes('no')).toBe(false);
      expect(isConsentYes('maybe')).toBe(false);
      expect(isConsentYes('')).toBe(false);
    });
  });

  describe('isConsentNo', () => {
    it('recognizes no', () => {
      expect(isConsentNo('no')).toBe(true);
      expect(isConsentNo('NO')).toBe(true);
      expect(isConsentNo('No')).toBe(true);
      expect(isConsentNo('n')).toBe(true);
      expect(isConsentNo('N')).toBe(true);
    });

    it('rejects non-no', () => {
      expect(isConsentNo('yes')).toBe(false);
      expect(isConsentNo('maybe')).toBe(false);
    });
  });

  describe('isValidName', () => {
    it('accepts valid names', () => {
      expect(isValidName('Alice')).toBe(true);
      expect(isValidName('Alice Smith')).toBe(true);
      expect(isValidName("O'Brien")).toBe(true);
      expect(isValidName('Mary-Jane')).toBe(true);
    });

    it('rejects empty names', () => {
      expect(isValidName('')).toBe(false);
      expect(isValidName('   ')).toBe(false);
    });

    it('rejects names with invalid characters', () => {
      expect(isValidName('Alice123')).toBe(false);
      expect(isValidName('Alice!')).toBe(false);
      expect(isValidName('/start')).toBe(false);
    });

    it('rejects excessively long names', () => {
      expect(isValidName('A'.repeat(201))).toBe(false);
    });
  });

  describe('isNpi', () => {
    it('recognizes 10-digit numbers', () => {
      expect(isNpi('1234567890')).toBe(true);
    });

    it('rejects non-10-digit input', () => {
      expect(isNpi('123456789')).toBe(false);
      expect(isNpi('12345678901')).toBe(false);
      expect(isNpi('abcdefghij')).toBe(false);
      expect(isNpi('')).toBe(false);
    });
  });
});

describe('processInput (State Machine)', () => {
  // -------------------------------------------------------------------------
  // START state
  // -------------------------------------------------------------------------
  describe('START state', () => {
    it('/start transitions to AWAITING_NAME with welcome message', () => {
      const session = makeSession('START');
      const result = processInput(session, '/start');

      expect(result.nextState).toBe('AWAITING_NAME');
      expect(result.response).toBe(WELCOME_MESSAGE);
    });

    it('non-/start input stays in START', () => {
      const session = makeSession('START');
      const result = processInput(session, 'hello');

      expect(result.nextState).toBe('START');
      expect(result.response).toContain('/start');
    });
  });

  // -------------------------------------------------------------------------
  // AWAITING_NAME state
  // -------------------------------------------------------------------------
  describe('AWAITING_NAME state', () => {
    it('valid name transitions to AWAITING_CONSENT', () => {
      const session = makeSession('AWAITING_NAME');
      const result = processInput(session, 'Alice Smith');

      expect(result.nextState).toBe('AWAITING_CONSENT');
      expect(result.response).toContain('Alice Smith');
      expect(result.response).toContain('consent');
    });

    it('empty name stays in AWAITING_NAME', () => {
      const session = makeSession('AWAITING_NAME');
      const result = processInput(session, '   ');

      expect(result.nextState).toBe('AWAITING_NAME');
      expect(result.response).toBe(INVALID_NAME_MESSAGE);
    });

    it('name with special characters is rejected', () => {
      const session = makeSession('AWAITING_NAME');
      const result = processInput(session, 'Alice<script>');

      expect(result.nextState).toBe('AWAITING_NAME');
      expect(result.response).toBe(INVALID_NAME_MESSAGE);
    });

    it('/start from AWAITING_NAME restarts', () => {
      const session = makeSession('AWAITING_NAME');
      const result = processInput(session, '/start');

      expect(result.nextState).toBe('AWAITING_NAME');
      expect(result.response).toBe(WELCOME_MESSAGE);
    });
  });

  // -------------------------------------------------------------------------
  // AWAITING_CONSENT state
  // -------------------------------------------------------------------------
  describe('AWAITING_CONSENT state', () => {
    it('"yes" transitions to ENROLLED with enrollment data', () => {
      const session = makeSession('AWAITING_CONSENT', { patient_name: 'Alice' });
      const result = processInput(session, 'yes');

      expect(result.nextState).toBe('ENROLLED');
      expect(result.response).toBe(ENROLLMENT_MESSAGE);
      expect(result.enrollmentData).toBeDefined();
      expect(result.enrollmentData!.patientName).toBe('Alice');
    });

    it('"y" transitions to ENROLLED', () => {
      const session = makeSession('AWAITING_CONSENT', { patient_name: 'Alice' });
      const result = processInput(session, 'y');

      expect(result.nextState).toBe('ENROLLED');
    });

    it('"YES" transitions to ENROLLED (case-insensitive)', () => {
      const session = makeSession('AWAITING_CONSENT', { patient_name: 'Alice' });
      const result = processInput(session, 'YES');

      expect(result.nextState).toBe('ENROLLED');
    });

    it('"no" transitions to DECLINED', () => {
      const session = makeSession('AWAITING_CONSENT', { patient_name: 'Alice' });
      const result = processInput(session, 'no');

      expect(result.nextState).toBe('DECLINED');
      expect(result.response).toBe(DECLINE_MESSAGE);
    });

    it('"n" transitions to DECLINED', () => {
      const session = makeSession('AWAITING_CONSENT', { patient_name: 'Alice' });
      const result = processInput(session, 'n');

      expect(result.nextState).toBe('DECLINED');
    });

    it('invalid consent response stays in AWAITING_CONSENT', () => {
      const session = makeSession('AWAITING_CONSENT', { patient_name: 'Alice' });
      const result = processInput(session, 'maybe');

      expect(result.nextState).toBe('AWAITING_CONSENT');
      expect(result.response).toBe(INVALID_CONSENT_MESSAGE);
    });

    it('empty consent response stays in AWAITING_CONSENT', () => {
      const session = makeSession('AWAITING_CONSENT', { patient_name: 'Alice' });
      const result = processInput(session, '');

      expect(result.nextState).toBe('AWAITING_CONSENT');
      expect(result.response).toBe(INVALID_CONSENT_MESSAGE);
    });

    it('consent does not default to yes', () => {
      const session = makeSession('AWAITING_CONSENT', { patient_name: 'Alice' });

      // These should NOT be treated as consent
      for (const input of ['sure', 'ok', 'okay', 'yep', 'yeah', 'absolutely', '1', 'true']) {
        const result = processInput(session, input);
        expect(result.nextState).not.toBe('ENROLLED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // ENROLLED state
  // -------------------------------------------------------------------------
  describe('ENROLLED state', () => {
    it('/start from ENROLLED returns already enrolled message', () => {
      const session = makeSession('ENROLLED');
      const result = processInput(session, '/start');

      expect(result.nextState).toBe('ENROLLED');
      expect(result.response).toBe(ALREADY_ENROLLED_MESSAGE);
    });

    it('NPI input returns pairing stub', () => {
      const session = makeSession('ENROLLED');
      const result = processInput(session, '1234567890');

      expect(result.nextState).toBe('ENROLLED');
      expect(result.response).toBe(PAIRING_STUB_MESSAGE);
    });

    it('non-NPI input prompts for NPI', () => {
      const session = makeSession('ENROLLED');
      const result = processInput(session, 'hello');

      expect(result.nextState).toBe('ENROLLED');
      expect(result.response).toContain('NPI');
    });
  });

  // -------------------------------------------------------------------------
  // DECLINED state
  // -------------------------------------------------------------------------
  describe('DECLINED state', () => {
    it('/start from DECLINED restarts onboarding', () => {
      const session = makeSession('DECLINED');
      const result = processInput(session, '/start');

      expect(result.nextState).toBe('AWAITING_NAME');
      expect(result.response).toBe(WELCOME_MESSAGE);
    });

    it('non-/start input stays in DECLINED', () => {
      const session = makeSession('DECLINED');
      const result = processInput(session, 'hello');

      expect(result.nextState).toBe('DECLINED');
      expect(result.response).toContain('/start');
    });
  });
});
