/**
 * Core entry point -- pure re-exports of the CareAgent public API.
 *
 * Use this when you need access to CareAgent types, schemas, and classes
 * without triggering any platform-specific registration or activation.
 *
 * IMPORTANT: This module must have ZERO side effects. It only re-exports
 * types, interfaces, and lazy factories. No file system, no audit,
 * no adapter creation happens at import time.
 */

// Adapter types
export type {
  PlatformAdapter,
  ToolCallEvent,
  ToolCallResult,
  ToolCallHandler,
  BootstrapContext,
  BootstrapHandler,
  CliCommandConfig,
  ServiceConfig,
  SlashCommandConfig,
} from '../adapters/types.js';

// Platform detection
export { detectPlatform } from '../adapters/detect.js';
export type { DetectedPlatform } from '../adapters/detect.js';

// Activation
export { ActivationGate } from '../activation/gate.js';
export type { ActivationResult, AuditCallback } from '../activation/gate.js';
export { CANSSchema } from '../activation/cans-schema.js';
export type { CANSDocument } from '../activation/cans-schema.js';

// Audit
export { AuditPipeline } from '../audit/pipeline.js';

// Workspace profiles
export { getWorkspaceProfile } from '../onboarding/workspace-profiles.js';
export type { WorkspaceProfile, WorkspaceFileSpec } from '../onboarding/workspace-profiles.js';

// Hardening
export type { HardeningEngine, HardeningLayerResult, HardeningConfig, HardeningLayerFn } from '../hardening/index.js';
export { createHardeningEngine } from '../hardening/index.js';
export { checkToolPolicy } from '../hardening/index.js';
export { checkExecAllowlist } from '../hardening/index.js';
export { checkCansInjection, extractProtocolRules, injectProtocol } from '../hardening/index.js';
export { checkDockerSandbox, detectDocker } from '../hardening/index.js';
export { checkConsentGate, attachConsentEngine, detachConsentEngine, mapToolToAction } from '../hardening/index.js';
export { checkDataMinimization } from '../hardening/index.js';
export { setupCanary } from '../hardening/index.js';
export type { CanaryHandle } from '../hardening/canary.js';

// Credentials
export type { CredentialValidator, CredentialCheckResult } from '../credentials/index.js';
export { createCredentialValidator } from '../credentials/index.js';

// Skills
export type { SkillManifest, SkillLoadResult } from '../skills/index.js';
export { SkillManifestSchema, validateManifest } from '../skills/index.js';
export { computeSkillFileHash, computeSkillChecksums, verifySkillIntegrity } from '../skills/index.js';
export { checkVersionPin, approveVersion } from '../skills/index.js';
export { loadClinicalSkills } from '../skills/index.js';

// Refinement
export type { RefinementEngine, Observation, Proposal, DivergencePattern, ObservationCategory, ProposalResolution } from '../refinement/index.js';
export { createRefinementEngine } from '../refinement/index.js';

// Neuron
export type { NeuronClient, NeuronRegistration } from '../neuron/index.js';
export { createNeuronClient } from '../neuron/index.js';

// Protocol
export type { ProtocolServer, ProtocolSession } from '../protocol/index.js';
export { createProtocolServer } from '../protocol/index.js';

// Consent
export {
  ConsentActionSchema,
  ConsentPostureSchema,
  HealthLiteracyLevelSchema,
  ConsentRecordSchema,
  ConsentDecisionSchema,
  ConsentPromptSchema,
  CustomConsentRuleSchema,
  ConsentEngineConfigSchema,
  createConsentEngine,
  generateConsentPrompt,
} from '../consent/index.js';

export type {
  ConsentAction,
  ConsentPosture,
  HealthLiteracyLevel,
  ConsentRecord,
  ConsentDecision,
  ConsentPrompt,
  CustomConsentRule,
  ConsentEngineConfig,
  ConsentEngine,
} from '../consent/index.js';

// Chart
export type { PatientChartVault, ChartOperationResult } from '../chart/types.js';

// Bot (Telegram onboarding)
export {
  OnboardingStateSchema,
  TelegramUpdateSchema,
  PatientSessionSchema,
  StateTransitionSchema,
  createTelegramTransport,
  createMockTransport,
  processInput,
  createOnboardingBot,
  generatePatientKeypair,
} from '../bot/index.js';

export type {
  OnboardingState,
  TelegramUpdate,
  PatientSession,
  StateTransition,
  TelegramTransport,
  OnboardingBot,
  OnboardingBotConfig,
  PatientKeypair,
} from '../bot/index.js';

// CANS generator
export { generateCANS } from '../onboarding/cans-generator.js';
export type { CANSGeneratorInput } from '../onboarding/cans-generator.js';

// Discovery (Axon registry + handshake)
export {
  RegistryEntrySchema,
  ConnectRequestSchema,
  SignedMessageSchema,
  ConnectGrantSchema,
  ConnectDenialSchema,
  DiscoveryResultSchema,
  HandshakeResultSchema,
  RegistryEntryValidator,
  ConnectGrantValidator,
  ConnectDenialValidator,
  createAxonClient,
  createDiscoveryHandshake,
  publicKeyToBase64Url,
  privateKeyToBase64Url,
  signPayload as signDiscoveryPayload,
  verifySignature as verifyDiscoverySignature,
  generateNonce,
} from '../discovery/index.js';

export type {
  RegistryEntry,
  ConnectRequest,
  ConnectGrant,
  ConnectDenial,
  DenialCode,
  DiscoveryResult,
  HandshakeResult,
  AxonClient,
  AxonClientConfig,
  DiscoveryHandshake,
  DiscoveryHandshakeConfig,
  DiscoveryAndHandshakeResult,
  HandshakeLedgerEntry,
} from '../discovery/index.js';

// Messaging (WebSocket receive pipeline)
export {
  ClinicalSummarySchema as MessagingClinicalSummarySchema,
  AppointmentReminderSchema as MessagingAppointmentReminderSchema,
  CarePlanUpdateSchema as MessagingCarePlanUpdateSchema,
  ClinicalMessageSchema as MessagingClinicalMessageSchema,
  SignedMessageEnvelopeSchema,
  SignedMessageEnvelopeValidator,
  MessageAckStatusSchema,
  RejectionReasonSchema,
  MessageAckSchema,
  MessageAckValidator,
  ConnectionAuthTokenSchema,
  ConnectionAuthTokenValidator,
  KnownProviderSchema,
  EncryptedPayloadSchema,
  MessageLedgerEntrySchema,
  MessagingServerConfigSchema,
  canonicalizePayload,
  verifyMessageSignature,
  signAck,
  encryptPayload,
  decryptPayload,
  generateEncryptionKey,
  createMessagePipeline,
  createMessagingServer,
} from '../messaging/index.js';

export type {
  ClinicalSummary as MessagingClinicalSummary,
  AppointmentReminder as MessagingAppointmentReminder,
  CarePlanUpdate as MessagingCarePlanUpdate,
  ClinicalMessage as MessagingClinicalMessage,
  SignedMessageEnvelope,
  MessageAckStatus,
  RejectionReason,
  MessageAck,
  ConnectionAuthToken,
  KnownProvider,
  EncryptedPayload,
  MessageLedgerEntry,
  MessagingServerConfig,
  MessagePipelineConfig,
  PipelineResult,
  MessagingServer,
  MessagingServerDeps,
} from '../messaging/index.js';
