/**
 * Standalone adapter -- provides a CareAgent adapter for non-OpenClaw environments.
 *
 * Uses cwd for workspace path, console for logging, and no-ops for all hook
 * and registration methods. Suitable for CLI-only or library usage where
 * no host platform plugin system is available.
 */

import type {
  PlatformAdapter,
  ToolCallHandler,
  BootstrapHandler,
  CliCommandConfig,
  ServiceConfig,
  SlashCommandConfig,
} from '../types.js';

const TAG = '[CareAgent]';

/**
 * Creates a standalone PlatformAdapter that operates without a host platform.
 *
 * @param workspacePath - The workspace directory. Defaults to process.cwd().
 */
export function createStandaloneAdapter(workspacePath?: string): PlatformAdapter {
  const resolvedPath = workspacePath ?? process.cwd();

  return {
    platform: 'standalone',

    getWorkspacePath(): string {
      return resolvedPath;
    },

    onBeforeToolCall(_handler: ToolCallHandler): void {
      // No-op: standalone has no hook system
    },

    onAgentBootstrap(_handler: BootstrapHandler): void {
      // No-op: standalone has no bootstrap system
    },

    registerCliCommand(_config: CliCommandConfig): void {
      // No-op: standalone has no CLI registration system
    },

    registerBackgroundService(_config: ServiceConfig): void {
      // No-op: standalone has no service registration system
    },

    registerSlashCommand(_config: SlashCommandConfig): void {
      // No-op: standalone has no slash command system
    },

    registerHook(_name: string, _handler: (...args: unknown[]) => void): void {
      // No-op: standalone has no hook system
    },

    log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
      if (data !== undefined) {
        console[level](`${TAG} ${message}`, data);
      } else {
        console[level](`${TAG} ${message}`);
      }
    },
  };
}
