/**
 * Tests for PatientOnboarding — A2A-based patient enrollment flow.
 *
 * Updated to use the local form engine and data router instead of
 * calling Axon's form engine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatientOnboarding } from '../../../src/a2a/onboarding.js';
import type { PatientOnboardingData } from '../../../src/a2a/onboarding.js';
import type { MessageIO } from '../../../src/a2a/consent-broker.js';
import type { PatientA2AClient } from '../../../src/a2a/client.js';
import type { ChartBridge } from '../../../src/a2a/chart-bridge.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockIO(): MessageIO {
  return {
    display: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
  };
}

function makeMockClient(): Partial<PatientA2AClient> {
  return {
    enroll: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockChartBridge(vaultDir = '/tmp/test-vault'): Partial<ChartBridge> {
  return {
    vaultDir,
    recordInteraction: vi.fn().mockResolvedValue('entry-id'),
  };
}

const testPatientData: PatientOnboardingData = {
  name: 'Elizabeth Anderson',
  address: '1579 River Rd, Johns Island, SC 29455',
  phone: '+1 252 414 2043',
  dateOfBirth: '1975-03-15',
  conditions: [
    { name: 'Hormone replacement therapy for menopause', status: 'active' },
    { name: 'Right leg sciatica', status: 'active' },
  ],
  healthLiteracy: 'standard',
  preferredLanguage: 'English',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PatientOnboarding', () => {
  let io: MessageIO;
  let client: Partial<PatientA2AClient>;
  let chartBridge: Partial<ChartBridge>;

  beforeEach(() => {
    io = makeMockIO();
    client = makeMockClient();
    chartBridge = makeMockChartBridge();
  });

  it('completes the full onboarding flow successfully', async () => {
    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    const result = await onboarding.run(testPatientData);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('records clinical data in the patient chart', async () => {
    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    await onboarding.run(testPatientData);

    // Should have at least identity + conditions entries
    expect(chartBridge.recordInteraction).toHaveBeenCalled();
    const callCount = (chartBridge.recordInteraction as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('generates CANS.md', async () => {
    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    const result = await onboarding.run(testPatientData);

    expect(result.cansPath).toBeDefined();
    expect(result.cansPath).toContain('CANS.md');
  });

  it('displays progress messages to patient', async () => {
    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    await onboarding.run(testPatientData);

    const messages = (io.display as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(messages.some((m: string) => m.includes('Onboarding complete'))).toBe(true);
  });

  it('returns error result on chart recording failure', async () => {
    chartBridge.recordInteraction = vi.fn().mockRejectedValue(new Error('Vault locked'));

    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    const result = await onboarding.run(testPatientData);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Vault locked');
  });

  describe('toFormAnswers', () => {
    it('converts PatientOnboardingData to form answers', () => {
      const answers = PatientOnboarding.toFormAnswers(testPatientData);

      expect(answers['consent_synthetic']).toBe(true);
      expect(answers['patient_name']).toBe('Elizabeth Anderson');
      expect(answers['address']).toBe('1579 River Rd, Johns Island, SC 29455');
      expect(answers['phone']).toBe('+1 252 414 2043');
      expect(answers['has_conditions']).toBe(true);
      expect(answers['conditions_list']).toContain('Hormone replacement therapy');
      expect(answers['conditions_list']).toContain('Right leg sciatica');
      expect(answers['health_literacy']).toBe('standard');
    });

    it('handles empty conditions', () => {
      const answers = PatientOnboarding.toFormAnswers({
        ...testPatientData,
        conditions: [],
      });

      expect(answers['has_conditions']).toBe(false);
      expect(answers['conditions_list']).toBeUndefined();
    });

    it('includes medications and allergies when present', () => {
      const answers = PatientOnboarding.toFormAnswers({
        ...testPatientData,
        medications: 'Estradiol 1mg daily',
        allergies: 'Penicillin',
      });

      expect(answers['has_medications']).toBe(true);
      expect(answers['medications_list']).toBe('Estradiol 1mg daily');
      expect(answers['has_allergies']).toBe(true);
      expect(answers['allergies_list']).toBe('Penicillin');
    });
  });
});
