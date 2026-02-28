/**
 * Consent module -- re-exports schemas, engine, and prompt generation.
 */

// Schemas
export {
  ConsentActionSchema,
  ConsentPostureSchema,
  HealthLiteracyLevelSchema,
  ConsentRecordSchema,
  ConsentDecisionSchema,
  ConsentPromptSchema,
  CustomConsentRuleSchema,
  ConsentEngineConfigSchema,
} from './schemas.js';

export type {
  ConsentAction,
  ConsentPosture,
  HealthLiteracyLevel,
  ConsentRecord,
  ConsentDecision,
  ConsentPrompt,
  CustomConsentRule,
  ConsentEngineConfig,
} from './schemas.js';

// Engine
export type { ConsentEngine } from './engine.js';
export { createConsentEngine } from './engine.js';

// Prompts
export { generateConsentPrompt } from './prompts.js';
