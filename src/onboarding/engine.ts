/**
 * Patient onboarding engine — orchestrates the full onboarding session.
 *
 * Uses the local form engine with the patient_onboarding questionnaire.
 * Loops: get next question → present to patient → receive answer → validate.
 * On completion, routes data to vault (PHI) vs CANS.md (non-PHI).
 *
 * For guided-mode questions, uses direct Anthropic API to present
 * conversationally with health literacy adaptation.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PatientFormEngine } from './form-engine.js';
import { loadPatientOnboardingQuestionnaire } from './questionnaire.js';
import { DataRouter, type CANSPreferences } from './data-router.js';
import { PatientLLMClient } from './llm-client.js';
import { generateCANS } from './cans-generator.js';
import type { ChartBridge } from '../a2a/chart-bridge.js';
import type { PatientA2AClient } from '../a2a/client.js';
import type { FormQuestion, FormResponse } from './questionnaire-schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * IO interface for the onboarding session.
 * Supports both asking questions (interactive) and displaying messages.
 */
export interface OnboardingIO {
  /** Send a message to the patient. */
  display(text: string): void;
  /** Ask the patient a question and receive their answer. */
  ask(prompt: string): Promise<string>;
}

export interface OnboardingResult {
  success: boolean;
  cansPath?: string;
  vaultPath?: string;
  entryCount?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Onboarding Engine
// ---------------------------------------------------------------------------

export class OnboardingEngine {
  private readonly chartBridge: ChartBridge;
  private readonly a2aClient: PatientA2AClient | null;
  private readonly workspacePath: string;
  private readonly llmClient: PatientLLMClient;

  constructor(opts: {
    chartBridge: ChartBridge;
    a2aClient: PatientA2AClient | null;
    workspacePath: string;
    llmClient?: PatientLLMClient;
  }) {
    this.chartBridge = opts.chartBridge;
    this.a2aClient = opts.a2aClient;
    this.workspacePath = opts.workspacePath;
    this.llmClient = opts.llmClient ?? new PatientLLMClient();
  }

  /**
   * Run interactive onboarding — questions asked one at a time via IO.
   */
  async runInteractive(io: OnboardingIO): Promise<OnboardingResult> {
    try {
      const questionnaire = loadPatientOnboardingQuestionnaire();
      const engine = new PatientFormEngine(questionnaire);
      const answers: Record<string, unknown> = {};

      io.display('Welcome to CareAgent patient onboarding.');
      io.display('I\'ll ask you a few questions to set up your health profile.\n');

      // Question loop
      let response: FormResponse = engine.next(answers);

      while (response.status === 'question') {
        const question = response.question;
        const answer = await this.presentAndCollect(io, question, answers);

        if (answer === null) {
          return { success: false, error: 'Onboarding cancelled by patient' };
        }

        // Validate
        const validation = engine.validate(question.id, answer);
        if (!validation.valid) {
          io.display(`Invalid answer: ${validation.error}. Please try again.`);
          continue;
        }

        answers[question.id] = answer;
        response = engine.next(answers);
      }

      if (response.status === 'hard_stop') {
        io.display(response.hard_stop_message);
        return { success: false, error: response.hard_stop_message };
      }

      // Route data
      return await this.completeOnboarding(io, answers);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Run onboarding with pre-filled answers (for E2E testing).
   * Passes all answers through the form engine for validation and artifact building.
   */
  async runWithData(
    io: OnboardingIO,
    prefilled: Record<string, unknown>,
  ): Promise<OnboardingResult> {
    try {
      const questionnaire = loadPatientOnboardingQuestionnaire();
      const engine = new PatientFormEngine(questionnaire);

      io.display('Starting onboarding with provided data...');

      // Validate all prefilled answers through the engine
      let response: FormResponse = engine.next(prefilled);

      // If there are still unanswered questions, it means prefilled data is incomplete
      if (response.status === 'question') {
        return {
          success: false,
          error: `Incomplete data: missing answer for "${response.question.id}"`,
        };
      }

      if (response.status === 'hard_stop') {
        io.display(response.hard_stop_message);
        return { success: false, error: response.hard_stop_message };
      }

      // Route data
      return await this.completeOnboarding(io, prefilled);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async presentAndCollect(
    io: OnboardingIO,
    question: FormQuestion,
    _answers: Record<string, unknown>,
  ): Promise<unknown> {
    let prompt: string;

    if (question.mode === 'guided' && question.llm_guidance) {
      // Use LLM to present the question conversationally
      const healthLiteracy = String(_answers['health_literacy'] ?? 'standard');
      prompt = await this.llmClient.presentQuestion(question, healthLiteracy, []);
    } else {
      // Structured mode: present raw question text
      prompt = question.text;
    }

    // Add options hint for select questions
    if (question.options && question.options.length > 0) {
      const optionLines = question.options.map((o) =>
        o.description ? `  ${o.value} — ${o.label}: ${o.description}` : `  ${o.value} — ${o.label}`,
      );
      prompt += '\n' + optionLines.join('\n');
    }

    const rawAnswer = await io.ask(prompt);

    // Normalize boolean answers
    if (question.answer_type === 'boolean') {
      const lower = rawAnswer.toLowerCase().trim();
      if (lower === 'yes' || lower === 'y' || lower === 'true') return true;
      if (lower === 'no' || lower === 'n' || lower === 'false') return false;
      return rawAnswer;
    }

    // For guided-mode text questions, parse with LLM
    if (question.mode === 'guided' && question.llm_guidance && question.answer_type === 'text') {
      return this.llmClient.parseAnswer(question, rawAnswer);
    }

    return rawAnswer;
  }

  private async completeOnboarding(
    io: OnboardingIO,
    answers: Record<string, unknown>,
  ): Promise<OnboardingResult> {
    io.display('Processing your information...');

    // Route data to vault and extract CANS preferences
    const router = new DataRouter(this.chartBridge, this.a2aClient);
    const routingResult = await router.route(answers as Record<string, unknown>);

    io.display(`Recorded ${routingResult.vaultEntryIds.length} entry(s) in your chart.`);

    // Generate CANS.md
    const cansContent = generateCANS({
      patient_id: `patient-${Date.now()}`,
      public_key: 'onboarding-placeholder',
      consent_posture: routingResult.cansPreferences.consent_posture,
      health_literacy_level: routingResult.cansPreferences.health_literacy_level,
      preferred_language: routingResult.cansPreferences.preferred_language,
    });

    const cansPath = join(this.workspacePath, 'CANS.md');
    if (!existsSync(dirname(cansPath))) {
      mkdirSync(dirname(cansPath), { recursive: true });
    }
    writeFileSync(cansPath, cansContent, 'utf-8');
    io.display(`CANS.md written to ${cansPath}`);

    if (routingResult.enrollmentSuccess) {
      io.display('Registered with CareAgent network.');
    }

    io.display('Onboarding complete!');

    return {
      success: true,
      cansPath,
      vaultPath: this.chartBridge.vaultDir,
      entryCount: routingResult.vaultEntryIds.length,
    };
  }
}
