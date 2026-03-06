/**
 * Adapter module -- factory functions and re-exports for platform adapters.
 */

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
  SlashCommandContext,
} from './types.js';

export { createAdapter } from './detect.js';
export { createOpenClawAdapter, triggerHook } from './openclaw/index.js';
export { createStandaloneAdapter } from './standalone/index.js';
export { detectPlatform } from './detect.js';
export type { DetectedPlatform } from './detect.js';
