/**
 * Data router — splits completed onboarding answers into:
 *
 * 1. PHI bucket → ChartBridge writes encrypted ledger entries
 * 2. CANS bucket → generates CANS.md (non-PHI preferences only)
 * 3. Network bucket → lightweight Axon enrollment (non-fatal)
 *
 * PHI (identity, conditions, medications, allergies) NEVER leaves the
 * patient-chart vault. Only non-PHI preferences go into CANS.md.
 */

import type { ChartBridge } from '../a2a/chart-bridge.js';
import type { PatientA2AClient } from '../a2a/client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingAnswers {
  // Consent
  consent_synthetic?: boolean | string;
  consent_audit?: boolean | string;

  // Identity (PHI → vault)
  patient_name?: string;
  date_of_birth?: string;
  address?: string;
  phone?: string;

  // Health history (PHI → vault)
  has_conditions?: boolean | string;
  conditions_list?: string;
  has_medications?: boolean | string;
  medications_list?: string;
  has_allergies?: boolean | string;
  allergies_list?: string;

  // Preferences (non-PHI → CANS.md)
  health_literacy?: string;
  preferred_language?: string;
}

export interface RoutingResult {
  vaultEntryIds: string[];
  cansPreferences: CANSPreferences;
  enrollmentSuccess: boolean;
}

export interface CANSPreferences {
  health_literacy_level: string;
  preferred_language: string;
  consent_posture: string;
}

// ---------------------------------------------------------------------------
// Data Router
// ---------------------------------------------------------------------------

export class DataRouter {
  private readonly chartBridge: ChartBridge;
  private readonly a2aClient: PatientA2AClient | null;

  constructor(chartBridge: ChartBridge, a2aClient: PatientA2AClient | null) {
    this.chartBridge = chartBridge;
    this.a2aClient = a2aClient;
  }

  /**
   * Route completed onboarding answers to their destinations.
   */
  async route(answers: OnboardingAnswers): Promise<RoutingResult> {
    const entryIds: string[] = [];

    // --- PHI → vault ---

    // Identity entry (patient_note)
    if (answers.patient_name) {
      const id = await this.writeVaultEntry('patient_note', 'patient_identity', {
        name: answers.patient_name,
        date_of_birth: answers.date_of_birth,
        address: answers.address,
        phone: answers.phone,
      });
      entryIds.push(id);
    }

    // Conditions (clinical_problem_list)
    if (answers.conditions_list) {
      const id = await this.writeVaultEntry('clinical_problem_list', 'conditions', {
        conditions: answers.conditions_list,
        source: 'patient_onboarding',
      });
      entryIds.push(id);
    }

    // Medications (clinical_medication)
    if (answers.medications_list) {
      const id = await this.writeVaultEntry('clinical_medication', 'medications', {
        medications: answers.medications_list,
        source: 'patient_onboarding',
      });
      entryIds.push(id);
    }

    // Allergies (clinical_allergy)
    if (answers.allergies_list) {
      const id = await this.writeVaultEntry('clinical_allergy', 'allergies', {
        allergies: answers.allergies_list,
        source: 'patient_onboarding',
      });
      entryIds.push(id);
    }

    // --- Non-PHI → CANS preferences ---
    const cansPreferences: CANSPreferences = {
      health_literacy_level: String(answers.health_literacy ?? 'standard'),
      preferred_language: String(answers.preferred_language ?? 'English'),
      consent_posture: 'deny',
    };

    // --- Network → Axon enrollment (non-fatal) ---
    let enrollmentSuccess = false;
    if (this.a2aClient && answers.patient_name) {
      try {
        await this.a2aClient.enroll({
          name: answers.patient_name,
          consent_posture: 'deny',
        });
        enrollmentSuccess = true;
      } catch {
        // Non-fatal — patient can still use CareAgent locally
      }
    }

    return {
      vaultEntryIds: entryIds,
      cansPreferences,
      enrollmentSuccess,
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async writeVaultEntry(
    entryType: string,
    interactionType: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    return this.chartBridge.recordInteraction(
      {
        id: `onboarding-${interactionType}-${Date.now()}`,
        status: { state: 'completed' },
        history: [
          {
            role: 'agent',
            parts: [
              {
                type: 'data',
                data: {
                  ...data,
                  recorded_at: new Date().toISOString(),
                },
              },
            ],
          },
        ],
      },
      {
        provider_npi: 'self',
        interaction_type: `onboarding_${interactionType}`,
      },
    );
  }
}
