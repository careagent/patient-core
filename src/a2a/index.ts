/**
 * A2A module barrel export.
 *
 * Re-exports the patient A2A client, consent broker, chart bridge,
 * and onboarding flow.
 */

// Client
export { PatientA2AClient } from './client.js';
export type { PatientA2AClientConfig } from './client.js';

// Consent broker
export { ConsentBroker } from './consent-broker.js';
export type { ConsentGrant, MessageIO } from './consent-broker.js';

// Chart bridge
export { ChartBridge } from './chart-bridge.js';
export type { ChartBridgeConfig } from './chart-bridge.js';

// Onboarding
export { PatientOnboarding } from './onboarding.js';
export type {
  PatientOnboardingData,
  PatientCondition,
  OnboardingResult,
} from './onboarding.js';
