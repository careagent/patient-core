/**
 * Patient onboarding flow — wires the onboarding engine to A2A modules.
 *
 * Orchestrates patient enrollment using the local form engine (PHI never
 * transits through Axon). Uses ChartBridge for vault operations,
 * PatientA2AClient for lightweight Axon enrollment, and OnboardingEngine
 * for the questionnaire-driven flow.
 */

import { dirname } from 'node:path';
import type { MessageIO } from './consent-broker.js';
import type { PatientA2AClient } from './client.js';
import type { ChartBridge } from './chart-bridge.js';
import { OnboardingEngine, type OnboardingIO, type OnboardingResult } from '../onboarding/engine.js';

// ---------------------------------------------------------------------------
// Types (preserved for backward compatibility)
// ---------------------------------------------------------------------------

export interface PatientCondition {
  name: string;
  status: string;
}

export interface PatientOnboardingData {
  name: string;
  address: string;
  phone: string;
  dateOfBirth?: string;
  conditions: PatientCondition[];
  medications?: string;
  allergies?: string;
  healthLiteracy?: string;
  preferredLanguage?: string;
}

export { OnboardingResult };

// ---------------------------------------------------------------------------
// PatientOnboarding
// ---------------------------------------------------------------------------

export class PatientOnboarding {
  private readonly a2aClient: PatientA2AClient;
  private readonly chartBridge: ChartBridge;
  private readonly messageIO: MessageIO;

  constructor(
    a2aClient: PatientA2AClient,
    chartBridge: ChartBridge,
    messageIO: MessageIO,
  ) {
    this.a2aClient = a2aClient;
    this.chartBridge = chartBridge;
    this.messageIO = messageIO;
  }

  /**
   * Run onboarding with pre-filled patient data (for E2E acceptance test).
   *
   * Converts PatientOnboardingData into form engine answers and runs
   * through the full questionnaire pipeline with validation and data routing.
   */
  async run(patientData: PatientOnboardingData): Promise<OnboardingResult> {
    const workspaceDir = this.resolveWorkspaceDir();

    // Convert PatientOnboardingData to form engine answers
    const answers = PatientOnboarding.toFormAnswers(patientData);

    const io = this.createOnboardingIO();

    const engine = new OnboardingEngine({
      chartBridge: this.chartBridge,
      a2aClient: this.a2aClient,
      workspacePath: workspaceDir,
    });

    return engine.runWithData(io, answers);
  }

  /**
   * Run interactive onboarding — questions asked one at a time via MessageIO.
   */
  async runInteractive(): Promise<OnboardingResult> {
    const workspaceDir = this.resolveWorkspaceDir();

    const io = this.createOnboardingIO();

    const engine = new OnboardingEngine({
      chartBridge: this.chartBridge,
      a2aClient: this.a2aClient,
      workspacePath: workspaceDir,
    });

    return engine.runInteractive(io);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private resolveWorkspaceDir(): string {
    // ChartBridge.vaultDir is typically workspace/vault — go up one level
    return dirname(this.chartBridge.vaultDir);
  }

  private createOnboardingIO(): OnboardingIO {
    return {
      display: (text: string) => this.messageIO.display(text),
      ask: async (prompt: string) => {
        this.messageIO.display(prompt);
        // In the current MessageIO model, we auto-confirm.
        // True interactive mode needs an extended IO interface.
        return '';
      },
    };
  }

  /**
   * Convert PatientOnboardingData to flat form engine answers.
   */
  static toFormAnswers(data: PatientOnboardingData): Record<string, unknown> {
    const answers: Record<string, unknown> = {
      consent_synthetic: true,
      consent_audit: true,
      patient_name: data.name,
      date_of_birth: data.dateOfBirth ?? '1970-01-01',
      address: data.address,
      phone: data.phone,
      has_conditions: data.conditions.length > 0,
      has_medications: Boolean(data.medications),
      has_allergies: Boolean(data.allergies),
      health_literacy: data.healthLiteracy ?? 'standard',
      preferred_language: data.preferredLanguage ?? 'English',
    };

    if (data.conditions.length > 0) {
      answers['conditions_list'] = data.conditions.map((c) => c.name).join(', ');
    }

    if (data.medications) {
      answers['medications_list'] = data.medications;
    }

    if (data.allergies) {
      answers['allergies_list'] = data.allergies;
    }

    return answers;
  }
}
