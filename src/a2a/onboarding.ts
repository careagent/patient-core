/**
 * Patient onboarding flow via A2A.
 *
 * Orchestrates the full patient enrollment and onboarding sequence:
 * 1. Register patient CANS identity with Axon via A2A
 * 2. Complete onboarding questionnaire (mock data for conditions)
 * 3. Create patient-chart vault with encrypted clinical findings
 * 4. Generate local CANS.md
 *
 * Uses PatientA2AClient for Axon communication, ChartBridge for vault
 * operations, and MessageIO for patient interaction.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { MessageIO } from './consent-broker.js';
import type { PatientA2AClient } from './client.js';
import type { ChartBridge } from './chart-bridge.js';
import { generateCANS } from '../onboarding/cans-generator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientCondition {
  name: string;
  status: string;
}

export interface PatientOnboardingData {
  name: string;
  address: string;
  phone: string;
  conditions: PatientCondition[];
}

export interface OnboardingResult {
  success: boolean;
  cansPath?: string;
  vaultPath?: string;
  error?: string;
}

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
   * Run the full patient enrollment and onboarding flow.
   *
   * Steps:
   * 1. Register patient identity with Axon via A2A enrollment
   * 2. Record clinical conditions in the patient chart vault
   * 3. Generate and save CANS.md locally
   */
  async run(patientData: PatientOnboardingData): Promise<OnboardingResult> {
    try {
      this.messageIO.display(`Starting onboarding for ${patientData.name}...`);

      // Step 1: Enroll with Axon
      this.messageIO.display('Registering with CareAgent network...');
      await this.a2aClient.enroll({
        name: patientData.name,
        consent_posture: 'deny',
      });
      this.messageIO.display('Registration complete.');

      // Step 2: Submit onboarding questionnaire answers
      this.messageIO.display('Submitting onboarding information...');
      const answers: Record<string, unknown> = {
        name: patientData.name,
        address: patientData.address,
        phone: patientData.phone,
        conditions: patientData.conditions,
      };
      await this.a2aClient.submitEnrollmentAnswer('patient_onboarding', answers);
      this.messageIO.display('Onboarding questionnaire submitted.');

      // Step 3: Record conditions in the patient chart
      this.messageIO.display('Recording clinical findings in your chart...');
      for (const condition of patientData.conditions) {
        await this.chartBridge.recordInteraction(
          {
            id: `onboarding-${condition.name.toLowerCase().replace(/\s+/g, '-')}`,
            status: { state: 'completed' },
            history: [
              {
                role: 'agent',
                parts: [
                  {
                    type: 'data',
                    data: {
                      condition_name: condition.name,
                      condition_status: condition.status,
                      source: 'patient_onboarding',
                    },
                  },
                ],
              },
            ],
          },
          {
            provider_npi: 'self',
            interaction_type: 'onboarding_finding',
          },
        );
      }
      this.messageIO.display(
        `Recorded ${patientData.conditions.length} condition(s) in your chart.`,
      );

      // Step 4: Generate CANS.md
      this.messageIO.display('Generating patient configuration...');
      const cansContent = generateCANS({
        patient_id: `patient-${Date.now()}`,
        public_key: 'onboarding-placeholder',
      });

      // Determine paths (vault dir is already known to chartBridge)
      const workspaceDir = dirname(this.chartBridge['vaultDir']);
      const cansPath = join(workspaceDir, 'CANS.md');

      if (!existsSync(dirname(cansPath))) {
        mkdirSync(dirname(cansPath), { recursive: true });
      }
      writeFileSync(cansPath, cansContent, 'utf-8');
      this.messageIO.display(`CANS.md written to ${cansPath}`);

      this.messageIO.display('Onboarding complete!');

      return {
        success: true,
        cansPath,
        vaultPath: this.chartBridge['vaultDir'],
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.messageIO.display(`Onboarding failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
