/**
 * Tests for PatientOnboarding — A2A-based patient enrollment flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatientOnboarding } from '../../../src/a2a/onboarding.js';
import type { PatientOnboardingData, OnboardingResult } from '../../../src/a2a/onboarding.js';
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
    submitEnrollmentAnswer: vi.fn().mockResolvedValue({
      id: 'enroll-task',
      status: { state: 'completed' },
    }),
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
  conditions: [
    { name: 'Hormone replacement therapy for menopause', status: 'active' },
    { name: 'Right leg sciatica', status: 'active' },
  ],
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

  it('enrolls with Axon via A2A', async () => {
    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    await onboarding.run(testPatientData);

    expect(client.enroll).toHaveBeenCalledWith({
      name: 'Elizabeth Anderson',
      consent_posture: 'deny',
    });
  });

  it('submits onboarding questionnaire', async () => {
    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    await onboarding.run(testPatientData);

    expect(client.submitEnrollmentAnswer).toHaveBeenCalledWith(
      'patient_onboarding',
      expect.objectContaining({
        name: 'Elizabeth Anderson',
        address: '1579 River Rd, Johns Island, SC 29455',
        conditions: testPatientData.conditions,
      }),
    );
  });

  it('records each condition in the patient chart', async () => {
    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    await onboarding.run(testPatientData);

    expect(chartBridge.recordInteraction).toHaveBeenCalledTimes(2);

    // First condition
    const call1 = (chartBridge.recordInteraction as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call1[0].id).toContain('hormone-replacement');
    expect(call1[1]).toEqual({
      provider_npi: 'self',
      interaction_type: 'onboarding_finding',
    });

    // Second condition
    const call2 = (chartBridge.recordInteraction as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(call2[0].id).toContain('right-leg-sciatica');
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
    expect(messages).toContain('Registering with CareAgent network...');
    expect(messages).toContain('Registration complete.');
    expect(messages.some((m: string) => m.includes('2 condition(s)'))).toBe(true);
    expect(messages).toContain('Onboarding complete!');
  });

  it('returns error result on enrollment failure', async () => {
    client.enroll = vi.fn().mockRejectedValue(new Error('Network failure'));

    const onboarding = new PatientOnboarding(
      client as PatientA2AClient,
      chartBridge as ChartBridge,
      io,
    );

    const result = await onboarding.run(testPatientData);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
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
});
