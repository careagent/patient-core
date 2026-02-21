/**
 * Core entry point -- pure re-exports of the CareAgent public API.
 *
 * Use this when you need access to CareAgent types, schemas, and classes
 * without triggering any platform-specific registration or activation.
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

// Chart
export type { PatientChartVault, ChartOperationResult } from '../chart/types.js';
