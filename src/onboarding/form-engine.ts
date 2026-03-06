/**
 * Lightweight local form engine for patient onboarding.
 *
 * Stateless — same API shape as Axon's FormEngine. Given a questionnaire
 * and accumulated answers, returns the next unanswered question, a
 * completion status with artifacts, or a hard stop.
 *
 * Supports: show_when, hard_stop, validation, cans_field mapping.
 * Does NOT need: npi_lookup, npi_prefill, repeat_for, action_assignments.
 */

import type {
  Question,
  QuestionCondition,
  Questionnaire,
  FormQuestion,
  FormResponse,
  ValidationResult,
} from './questionnaire-schema.js';

export class PatientFormEngine {
  private readonly questionnaire: Questionnaire;

  constructor(questionnaire: Questionnaire) {
    this.questionnaire = questionnaire;
  }

  /**
   * Get the next unanswered, visible question given accumulated answers.
   */
  next(answers: Record<string, unknown>): FormResponse {
    const questions = this.questionnaire.questions;

    const visibleQuestions = questions.filter((q) =>
      PatientFormEngine.isVisible(q, answers),
    );

    const totalVisible = visibleQuestions.length;

    for (let i = 0; i < visibleQuestions.length; i++) {
      const question = visibleQuestions[i]!;
      const answer = answers[question.id];

      if (answer !== undefined) {
        const hardStopResult = PatientFormEngine.checkHardStop(question, answer);
        if (hardStopResult) return hardStopResult;
        continue;
      }

      return {
        status: 'question',
        question: PatientFormEngine.toFormQuestion(question),
        progress: {
          current: i + 1,
          total: totalVisible,
          percentage: Math.round((i / totalVisible) * 100),
        },
      };
    }

    // All visible questions answered — final hard_stop sweep
    for (const question of visibleQuestions) {
      const answer = answers[question.id];
      if (answer !== undefined) {
        const hardStopResult = PatientFormEngine.checkHardStop(question, answer);
        if (hardStopResult) return hardStopResult;
      }
    }

    // Build artifacts from cans_field mappings
    const artifacts = PatientFormEngine.buildArtifacts(visibleQuestions, answers);

    return {
      status: 'completed',
      artifacts,
      progress: {
        current: totalVisible,
        total: totalVisible,
        percentage: 100,
      },
    };
  }

  /**
   * Validate a single answer against its question's constraints.
   */
  validate(questionId: string, answer: unknown): ValidationResult {
    const question = this.questionnaire.questions.find((q) => q.id === questionId);
    if (!question) {
      return { valid: false, error: `Unknown question: ${questionId}` };
    }
    return PatientFormEngine.validateAnswer(question, answer);
  }

  // --- Private helpers ---

  private static isVisible(question: Question, answers: Record<string, unknown>): boolean {
    if (!question.show_when) return true;
    return PatientFormEngine.evaluateCondition(question.show_when, answers);
  }

  private static evaluateCondition(
    condition: QuestionCondition,
    answers: Record<string, unknown>,
  ): boolean {
    const answerValue = answers[condition.question_id];
    if (answerValue === undefined) return false;

    const answerStr = String(answerValue);

    // Legacy format: just `equals` field
    if (condition.equals !== undefined && condition.operator === undefined) {
      return answerStr === condition.equals;
    }

    const operator = condition.operator ?? 'equals';
    const compareValue = condition.value ?? condition.equals ?? '';

    switch (operator) {
      case 'equals':
        return answerStr === compareValue;
      case 'not_equals':
        return answerStr !== compareValue;
      case 'contains':
        return answerStr.includes(compareValue);
      case 'greater_than':
        return Number(answerStr) > Number(compareValue);
      case 'less_than':
        return Number(answerStr) < Number(compareValue);
      default:
        return false;
    }
  }

  private static checkHardStop(
    question: Question,
    answer: unknown,
  ): FormResponse | null {
    if (!question.hard_stop) return null;

    const hardStop = question.hard_stop;
    const answerStr = String(answer);

    switch (hardStop.operator) {
      case 'equals':
        if (answerStr === (hardStop.value ?? '')) {
          return { status: 'hard_stop', hard_stop_message: hardStop.message };
        }
        break;
      case 'not_equals':
        if (answerStr !== (hardStop.value ?? '')) {
          return { status: 'hard_stop', hard_stop_message: hardStop.message };
        }
        break;
    }

    return null;
  }

  private static toFormQuestion(question: Question): FormQuestion {
    const fq: FormQuestion = {
      id: question.id,
      text: question.text,
      answer_type: question.answer_type,
      required: question.required,
    };

    if (question.options) fq.options = question.options;
    if (question.llm_guidance) fq.llm_guidance = question.llm_guidance;
    if (question.classification) fq.classification = question.classification;
    if (question.mode) fq.mode = question.mode;
    if (question.validation) fq.validation = question.validation;

    return fq;
  }

  private static buildArtifacts(
    questions: Question[],
    answers: Record<string, unknown>,
  ): Record<string, unknown> {
    const artifacts: Record<string, unknown> = {};

    for (const question of questions) {
      const answer = answers[question.id];
      if (answer === undefined || !question.cans_field) continue;
      PatientFormEngine.setNestedPath(artifacts, question.cans_field, answer);
    }

    return artifacts;
  }

  private static setNestedPath(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (current[part] === undefined || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]!] = value;
  }

  private static validateAnswer(question: Question, answer: unknown): ValidationResult {
    if (question.required && (answer === undefined || answer === null || answer === '')) {
      return { valid: false, error: 'This field is required' };
    }

    if (answer === undefined || answer === null || answer === '') {
      return { valid: true };
    }

    switch (question.answer_type) {
      case 'boolean': {
        if (typeof answer !== 'boolean' && answer !== 'true' && answer !== 'false') {
          return { valid: false, error: 'Answer must be true or false' };
        }
        break;
      }
      case 'number': {
        if (Number.isNaN(Number(answer))) {
          return { valid: false, error: 'Answer must be a number' };
        }
        break;
      }
      case 'date': {
        if (Number.isNaN(Date.parse(String(answer)))) {
          return { valid: false, error: 'Answer must be a valid date' };
        }
        break;
      }
      case 'single_select': {
        if (question.options && question.options.length > 0) {
          const validValues = question.options.map((o) => o.value);
          if (!validValues.includes(String(answer))) {
            return { valid: false, error: `Answer must be one of: ${validValues.join(', ')}` };
          }
        }
        break;
      }
      case 'multi_select': {
        if (question.options && question.options.length > 0) {
          const validValues = question.options.map((o) => o.value);
          const selections = Array.isArray(answer) ? answer : [answer];
          for (const selection of selections) {
            if (!validValues.includes(String(selection))) {
              return { valid: false, error: `Invalid selection: ${String(selection)}` };
            }
          }
        }
        break;
      }
      case 'text': {
        const textStr = String(answer);
        if (question.validation) {
          if (question.validation.min_length !== undefined && textStr.length < question.validation.min_length) {
            return { valid: false, error: `Answer must be at least ${question.validation.min_length} characters` };
          }
          if (question.validation.max_length !== undefined && textStr.length > question.validation.max_length) {
            return { valid: false, error: `Answer must be at most ${question.validation.max_length} characters` };
          }
          if (question.validation.pattern) {
            const regex = new RegExp(question.validation.pattern);
            if (!regex.test(textStr)) {
              return { valid: false, error: `Answer does not match required format` };
            }
          }
        }
        break;
      }
    }

    return { valid: true };
  }
}
