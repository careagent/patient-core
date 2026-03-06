/**
 * Tests for the data router — PHI vs CANS split.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataRouter, type OnboardingAnswers } from '../../../src/onboarding/data-router.js';
import type { ChartBridge } from '../../../src/a2a/chart-bridge.js';
import type { PatientA2AClient } from '../../../src/a2a/client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockChartBridge(): Partial<ChartBridge> {
  return {
    vaultDir: '/tmp/test-vault',
    recordInteraction: vi.fn().mockResolvedValue('entry-id'),
  };
}

function makeMockClient(): Partial<PatientA2AClient> {
  return {
    enroll: vi.fn().mockResolvedValue(undefined),
  };
}

const fullAnswers: OnboardingAnswers = {
  consent_synthetic: true,
  consent_audit: true,
  patient_name: 'Elizabeth Anderson',
  date_of_birth: '1975-03-15',
  address: '1579 River Rd, Johns Island, SC 29455',
  phone: '+1 252 414 2043',
  has_conditions: true,
  conditions_list: 'Hormone replacement therapy, Right leg sciatica',
  has_medications: true,
  medications_list: 'Estradiol 1mg daily',
  has_allergies: true,
  allergies_list: 'Penicillin',
  health_literacy: 'standard',
  preferred_language: 'English',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataRouter', () => {
  let chartBridge: Partial<ChartBridge>;
  let client: Partial<PatientA2AClient>;

  beforeEach(() => {
    chartBridge = makeMockChartBridge();
    client = makeMockClient();
  });

  it('writes identity to vault', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    await router.route(fullAnswers);

    const calls = (chartBridge.recordInteraction as ReturnType<typeof vi.fn>).mock.calls;
    const identityCall = calls.find((c: unknown[]) =>
      (c[1] as Record<string, string>).interaction_type === 'onboarding_patient_identity',
    );
    expect(identityCall).toBeDefined();
  });

  it('writes conditions to vault', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    await router.route(fullAnswers);

    const calls = (chartBridge.recordInteraction as ReturnType<typeof vi.fn>).mock.calls;
    const conditionsCall = calls.find((c: unknown[]) =>
      (c[1] as Record<string, string>).interaction_type === 'onboarding_conditions',
    );
    expect(conditionsCall).toBeDefined();
  });

  it('writes medications to vault', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    await router.route(fullAnswers);

    const calls = (chartBridge.recordInteraction as ReturnType<typeof vi.fn>).mock.calls;
    const medsCall = calls.find((c: unknown[]) =>
      (c[1] as Record<string, string>).interaction_type === 'onboarding_medications',
    );
    expect(medsCall).toBeDefined();
  });

  it('writes allergies to vault', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    await router.route(fullAnswers);

    const calls = (chartBridge.recordInteraction as ReturnType<typeof vi.fn>).mock.calls;
    const allergiesCall = calls.find((c: unknown[]) =>
      (c[1] as Record<string, string>).interaction_type === 'onboarding_allergies',
    );
    expect(allergiesCall).toBeDefined();
  });

  it('records 4 vault entries for full data', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    const result = await router.route(fullAnswers);

    expect(result.vaultEntryIds).toHaveLength(4);
  });

  it('skips conditions entry when no conditions', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    const result = await router.route({
      ...fullAnswers,
      has_conditions: false,
      conditions_list: undefined,
      has_medications: false,
      medications_list: undefined,
      has_allergies: false,
      allergies_list: undefined,
    });

    // Only identity entry
    expect(result.vaultEntryIds).toHaveLength(1);
  });

  it('extracts CANS preferences (non-PHI)', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    const result = await router.route(fullAnswers);

    expect(result.cansPreferences).toEqual({
      health_literacy_level: 'standard',
      preferred_language: 'English',
      consent_posture: 'deny',
    });
  });

  it('uses defaults for missing preferences', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    const result = await router.route({
      patient_name: 'Test',
    });

    expect(result.cansPreferences.health_literacy_level).toBe('standard');
    expect(result.cansPreferences.preferred_language).toBe('English');
  });

  it('enrolls with Axon (non-fatal)', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    const result = await router.route(fullAnswers);

    expect(result.enrollmentSuccess).toBe(true);
    expect(client.enroll).toHaveBeenCalledWith({
      name: 'Elizabeth Anderson',
      consent_posture: 'deny',
    });
  });

  it('handles Axon enrollment failure gracefully', async () => {
    client.enroll = vi.fn().mockRejectedValue(new Error('Network error'));

    const router = new DataRouter(chartBridge as ChartBridge, client as PatientA2AClient);
    const result = await router.route(fullAnswers);

    expect(result.enrollmentSuccess).toBe(false);
    // Should not throw
  });

  it('works without A2A client', async () => {
    const router = new DataRouter(chartBridge as ChartBridge, null);
    const result = await router.route(fullAnswers);

    expect(result.enrollmentSuccess).toBe(false);
    expect(result.vaultEntryIds.length).toBeGreaterThan(0);
  });
});
