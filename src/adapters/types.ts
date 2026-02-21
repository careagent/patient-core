/**
 * Platform adapter types -- the interface boundary between CareAgent and host platforms.
 *
 * All CareAgent code interacts with host platforms exclusively through these types.
 * The adapter layer translates between these stable interfaces and whatever
 * the host platform's API looks like at any given version.
 *
 * Patient-core extends provider-core's interface with a generic registerHook
 * method for future patient-specific hooks (consent gate, channel transport).
 */

/** Event passed to tool call handlers before execution. */
export interface ToolCallEvent {
  toolName: string;
  method?: string;
  params?: Record<string, unknown>;
  sessionKey?: string;
}

/** Result returned from a tool call handler to allow or block execution. */
export interface ToolCallResult {
  block: boolean;
  blockReason?: string;
}

/** Handler invoked before every tool call -- can block execution. */
export type ToolCallHandler = (call: ToolCallEvent) => ToolCallResult;

/** Context provided during agent bootstrap for injecting workspace files. */
export interface BootstrapContext {
  addFile(name: string, content: string): void;
}

/** Handler invoked during agent bootstrap to inject clinical context. */
export type BootstrapHandler = (context: BootstrapContext) => void;

/** Configuration for registering a CLI command. */
export interface CliCommandConfig {
  name: string;
  description: string;
  handler: (...args: unknown[]) => void | Promise<void>;
}

/** Configuration for registering a background service. */
export interface ServiceConfig {
  id: string;
  start: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
}

/** Configuration for registering a slash command. */
export interface SlashCommandConfig {
  name: string;
  description: string;
  handler: (args: string) => void | Promise<void>;
}

/**
 * The main interface for all host platform interactions.
 *
 * CareAgent subsystems depend on this interface, never on a host platform's raw API.
 * Platform-specific adapter implementations (OpenClaw, standalone, etc.) translate
 * between this stable interface and the host platform's actual API surface.
 */
export interface PlatformAdapter {
  /** Identifies which platform this adapter connects to. */
  readonly platform: string;

  /** Returns the workspace directory path. */
  getWorkspacePath(): string;

  /** Registers a handler invoked before every tool call. */
  onBeforeToolCall(handler: ToolCallHandler): void;

  /** Registers a handler invoked during agent bootstrap. */
  onAgentBootstrap(handler: BootstrapHandler): void;

  /** Registers a CLI command with the host platform. */
  registerCliCommand(config: CliCommandConfig): void;

  /** Registers a background service with the host platform. */
  registerBackgroundService(config: ServiceConfig): void;

  /** Registers a slash command with the host platform. */
  registerSlashCommand(config: SlashCommandConfig): void;

  /** Logs a message through the host platform's logging system. */
  log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;

  /** Registers a named hook handler for patient-specific extensibility. */
  registerHook(name: string, handler: (...args: unknown[]) => void): void;
}
