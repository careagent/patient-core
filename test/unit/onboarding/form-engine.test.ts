/**
 * Tests for the patient local form engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatientFormEngine } from '../../../src/onboarding/form-engine.js';
import { loadPatientOnboardingQuestionnaire, clearQuestionnaireCache } from '../../../src/onboarding/questionnaire.js';
import type { Questionnaire } from '../../../src/onboarding/questionnaire-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEngine(): PatientFormEngine {
  const q = loadPatientOnboardingQuestionnaire();
  return new PatientFormEngine(q);
}

// Minimal questionnaire for isolated tests
function createMinimalQuestionnaire(): Questionnaire {
  return {
    provider_type: 'patient',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Test',
    description: 'Test questionnaire',
    questions: [
      {
        id: 'q1',
        text: 'First question?',
        answer_type: 'boolean',
        required: true,
        mode: 'structured',
      },
      {
        id: 'q2',
        text: 'Second question?',
        answer_type: 'text',
        required: true,
        show_when: { question_id: 'q1', operator: 'equals', value: 'true' },
        validation: { min_length: 3 },
        mode: 'structured',
      },
      {
        id: 'q3',
        text: 'Third question?',
        answer_type: 'text',
        required: true,
        mode: 'structured',
        cans_field: 'test.field',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PatientFormEngine', () => {
  beforeEach(() => {
    clearQuestionnaireCache();
  });

  describe('question sequencing', () => {
    it('returns the first unanswered question', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.next({});

      expect(result.status).toBe('question');
      if (result.status === 'question') {
        expect(result.question.id).toBe('q1');
      }
    });

    it('skips answered questions', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.next({ q1: false });

      expect(result.status).toBe('question');
      if (result.status === 'question') {
        // q2 is hidden (show_when: q1 = true), so should jump to q3
        expect(result.question.id).toBe('q3');
      }
    });

    it('returns completed when all visible questions answered', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.next({ q1: false, q3: 'hello' });

      expect(result.status).toBe('completed');
    });

    it('includes progress in question responses', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.next({});

      expect(result.status).toBe('question');
      if (result.status === 'question') {
        expect(result.progress.current).toBe(1);
        expect(result.progress.total).toBeGreaterThan(0);
        expect(result.progress.percentage).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('show_when conditions', () => {
    it('shows conditional question when condition is met', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.next({ q1: true });

      expect(result.status).toBe('question');
      if (result.status === 'question') {
        expect(result.question.id).toBe('q2');
      }
    });

    it('hides conditional question when condition is not met', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.next({ q1: false });

      expect(result.status).toBe('question');
      if (result.status === 'question') {
        expect(result.question.id).toBe('q3');
      }
    });
  });

  describe('hard_stop', () => {
    it('returns hard_stop when condition triggers', () => {
      const q: Questionnaire = {
        provider_type: 'patient',
        version: '1.0.0',
        taxonomy_version: '1.0.0',
        display_name: 'Test',
        description: 'Test',
        questions: [
          {
            id: 'consent',
            text: 'Do you agree?',
            answer_type: 'boolean',
            required: true,
            hard_stop: {
              operator: 'equals',
              value: 'false',
              message: 'Cannot proceed without consent.',
            },
          },
        ],
      };

      const engine = new PatientFormEngine(q);
      const result = engine.next({ consent: false });

      expect(result.status).toBe('hard_stop');
      if (result.status === 'hard_stop') {
        expect(result.hard_stop_message).toContain('Cannot proceed');
      }
    });

    it('does not trigger hard_stop when condition is not met', () => {
      const q: Questionnaire = {
        provider_type: 'patient',
        version: '1.0.0',
        taxonomy_version: '1.0.0',
        display_name: 'Test',
        description: 'Test',
        questions: [
          {
            id: 'consent',
            text: 'Do you agree?',
            answer_type: 'boolean',
            required: true,
            hard_stop: {
              operator: 'equals',
              value: 'false',
              message: 'Cannot proceed.',
            },
          },
        ],
      };

      const engine = new PatientFormEngine(q);
      const result = engine.next({ consent: true });

      expect(result.status).toBe('completed');
    });
  });

  describe('validation', () => {
    it('validates required fields', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.validate('q1', '');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('validates text min_length', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.validate('q2', 'ab');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 3');
    });

    it('accepts valid text', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.validate('q2', 'hello world');

      expect(result.valid).toBe(true);
    });

    it('validates boolean answers', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());

      expect(engine.validate('q1', true).valid).toBe(true);
      expect(engine.validate('q1', 'true').valid).toBe(true);
      expect(engine.validate('q1', 'false').valid).toBe(true);
      expect(engine.validate('q1', 'maybe').valid).toBe(false);
    });

    it('validates single_select against options', () => {
      const q: Questionnaire = {
        provider_type: 'patient',
        version: '1.0.0',
        taxonomy_version: '1.0.0',
        display_name: 'Test',
        description: 'Test',
        questions: [
          {
            id: 'choice',
            text: 'Pick one',
            answer_type: 'single_select',
            required: true,
            options: [
              { value: 'a', label: 'Option A' },
              { value: 'b', label: 'Option B' },
            ],
          },
        ],
      };

      const engine = new PatientFormEngine(q);
      expect(engine.validate('choice', 'a').valid).toBe(true);
      expect(engine.validate('choice', 'c').valid).toBe(false);
    });

    it('validates date answers', () => {
      const q: Questionnaire = {
        provider_type: 'patient',
        version: '1.0.0',
        taxonomy_version: '1.0.0',
        display_name: 'Test',
        description: 'Test',
        questions: [
          {
            id: 'dob',
            text: 'Date?',
            answer_type: 'date',
            required: true,
          },
        ],
      };

      const engine = new PatientFormEngine(q);
      expect(engine.validate('dob', '2025-01-15').valid).toBe(true);
      expect(engine.validate('dob', 'not-a-date').valid).toBe(false);
    });

    it('returns error for unknown question', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.validate('nonexistent', 'value');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown question');
    });
  });

  describe('artifact building', () => {
    it('builds artifacts from cans_field mappings', () => {
      const engine = new PatientFormEngine(createMinimalQuestionnaire());
      const result = engine.next({ q1: false, q3: 'test-value' });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.artifacts).toEqual({
          test: { field: 'test-value' },
        });
      }
    });
  });

  describe('with real patient_onboarding questionnaire', () => {
    it('loads the questionnaire successfully', () => {
      const engine = createEngine();
      const result = engine.next({});

      expect(result.status).toBe('question');
      if (result.status === 'question') {
        expect(result.question.id).toBe('consent_synthetic');
      }
    });

    it('proceeds through consent to identity', () => {
      const engine = createEngine();
      const result = engine.next({
        consent_synthetic: true,
        consent_audit: true,
      });

      expect(result.status).toBe('question');
      if (result.status === 'question') {
        expect(result.question.id).toBe('patient_name');
      }
    });

    it('hard stops on synthetic data refusal', () => {
      const engine = createEngine();
      const result = engine.next({ consent_synthetic: false });

      expect(result.status).toBe('hard_stop');
    });

    it('completes with full answers', () => {
      const engine = createEngine();
      const result = engine.next({
        consent_synthetic: true,
        consent_audit: true,
        patient_name: 'Elizabeth Anderson',
        date_of_birth: '1975-03-15',
        address: '1579 River Rd, Johns Island, SC 29455',
        phone: '+1 252 414 2043',
        has_conditions: true,
        conditions_list: 'Hormone replacement therapy, Right leg sciatica',
        has_medications: false,
        has_allergies: false,
        health_literacy: 'standard',
        preferred_language: 'English',
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.artifacts).toHaveProperty('patient');
        expect(result.artifacts).toHaveProperty('preferences');
      }
    });

    it('skips conditions_list when has_conditions is false', () => {
      const engine = createEngine();

      // Answer through identity
      const answers: Record<string, unknown> = {
        consent_synthetic: true,
        consent_audit: true,
        patient_name: 'Test',
        date_of_birth: '2000-01-01',
        address: '123 Main St, City, ST 12345',
        phone: '555-0100',
        has_conditions: false,
      };

      const result = engine.next(answers);
      expect(result.status).toBe('question');
      if (result.status === 'question') {
        // Should skip conditions_list and go to has_medications
        expect(result.question.id).toBe('has_medications');
      }
    });
  });
});
