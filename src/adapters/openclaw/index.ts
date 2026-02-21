/**
 * OpenClaw adapter -- translates between CareAgent's stable interfaces
 * and OpenClaw's actual API surface.
 *
 * Every OpenClaw interaction is wrapped in try/catch for graceful degradation.
 * When an API method is missing or changes shape, the adapter logs a warning
 * and falls back to a safe default rather than crashing the plugin.
 */

import type {
  PlatformAdapter,
  ToolCallHandler,
  BootstrapHandler,
  CliCommandConfig,
  ServiceConfig,
  SlashCommandConfig,
} from '../types.js';

const TAG = '[CareAgent:Adapter]';

/**
 * Internal hook registry for patient-specific extensibility.
 * Hooks are stored per-name and triggered via triggerHook().
 */
const hookRegistry = new Map<string, Array<(...args: unknown[]) => void>>();

/**
 * Trigger all handlers registered under a given hook name.
 *
 * @param name - The hook name to trigger.
 * @param args - Arguments forwarded to each handler.
 */
export function triggerHook(name: string, ...args: unknown[]): void {
  const handlers = hookRegistry.get(name);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(...args);
    } catch {
      // Swallow errors from individual hook handlers
    }
  }
}

/**
 * Creates a PlatformAdapter from the raw OpenClaw plugin API.
 *
 * @param api - The raw API object passed to the plugin's register() function.
 *              Typed as `unknown` because we cannot depend on OpenClaw types.
 */
export function createOpenClawAdapter(api: unknown): PlatformAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = api as any;

  function log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    try {
      if (typeof raw?.log === 'function') {
        raw.log(level, message, data);
        return;
      }
    } catch {
      // Fall through to console
    }
    if (data !== undefined) {
      console[level](`${TAG} ${message}`, data);
    } else {
      console[level](`${TAG} ${message}`);
    }
  }

  return {
    platform: 'openclaw',

    getWorkspacePath(): string {
      try {
        if (typeof raw?.workspaceDir === 'string' && raw.workspaceDir) {
          log('info', `Workspace resolved from api.workspaceDir: ${raw.workspaceDir}`);
          return raw.workspaceDir;
        }
        if (typeof raw?.config?.workspaceDir === 'string' && raw.config.workspaceDir) {
          log('info', `Workspace resolved from api.config.workspaceDir: ${raw.config.workspaceDir}`);
          return raw.config.workspaceDir;
        }
        if (typeof raw?.context?.workspaceDir === 'string' && raw.context.workspaceDir) {
          log('info', `Workspace resolved from api.context.workspaceDir: ${raw.context.workspaceDir}`);
          return raw.context.workspaceDir;
        }
      } catch {
        // Fall through to cwd
      }
      const cwd = process.cwd();
      log('warn', `Workspace not found on API object, falling back to cwd: ${cwd}`);
      return cwd;
    },

    onBeforeToolCall(handler: ToolCallHandler): void {
      try {
        if (typeof raw?.on === 'function') {
          raw.on('before_tool_call', handler);
          log('info', 'Registered before_tool_call handler');
        } else {
          log('warn', 'Cannot register before_tool_call handler: api.on is not available');
        }
      } catch (err) {
        log('warn', 'Failed to register before_tool_call handler', err);
      }
    },

    onAgentBootstrap(handler: BootstrapHandler): void {
      try {
        if (typeof raw?.on === 'function') {
          raw.on('agent:bootstrap', handler);
          log('info', 'Registered agent:bootstrap handler');
        } else {
          log('warn', 'Cannot register agent:bootstrap handler: api.on is not available');
        }
      } catch (err) {
        log('warn', 'Failed to register agent:bootstrap handler', err);
      }
    },

    registerCliCommand(config: CliCommandConfig): void {
      try {
        if (typeof raw?.registerCli === 'function') {
          raw.registerCli(
            ({ program }: { program: { command: (name: string) => { description: (desc: string) => { action: (handler: (...args: unknown[]) => void | Promise<void>) => void } } } }) => {
              program
                .command(config.name)
                .description(config.description)
                .action(config.handler);
            },
            { commands: [config.name] },
          );
          log('info', `Registered CLI command: ${config.name}`);
        } else {
          log('warn', `Cannot register CLI command '${config.name}': api.registerCli is not available`);
        }
      } catch (err) {
        log('warn', `Failed to register CLI command '${config.name}'`, err);
      }
    },

    registerBackgroundService(config: ServiceConfig): void {
      try {
        if (typeof raw?.registerService === 'function') {
          raw.registerService(config);
          log('info', `Registered background service: ${config.id}`);
        } else {
          log('warn', `Cannot register service '${config.id}': api.registerService is not available`);
        }
      } catch (err) {
        log('warn', `Failed to register service '${config.id}'`, err);
      }
    },

    registerSlashCommand(config: SlashCommandConfig): void {
      try {
        if (typeof raw?.registerCommand === 'function') {
          raw.registerCommand(config);
          log('info', `Registered slash command: ${config.name}`);
        } else {
          log('warn', `Cannot register slash command '${config.name}': api.registerCommand is not available`);
        }
      } catch (err) {
        log('warn', `Failed to register slash command '${config.name}'`, err);
      }
    },

    registerHook(name: string, handler: (...args: unknown[]) => void): void {
      try {
        if (!hookRegistry.has(name)) {
          hookRegistry.set(name, []);
        }
        hookRegistry.get(name)!.push(handler);
        log('info', `Registered hook: ${name}`);
      } catch (err) {
        log('warn', `Failed to register hook '${name}'`, err);
      }
    },

    log,
  };
}
