/**
 * Mock OpenClaw API for testing.
 *
 * Provides a full mock API that records all method calls for assertions,
 * and a minimal mock API for graceful degradation testing.
 */

export interface MockAPICall {
  method: string;
  args: unknown[];
}

export interface MockAPI {
  workspaceDir: string;
  registerCli: (cb: Function, opts: unknown) => void;
  registerService: (config: unknown) => void;
  registerCommand: (config: unknown) => void;
  on: (event: string, handler: Function) => void;
  log: (level: string, msg: string, data?: unknown) => void;
  calls: MockAPICall[];
}

/**
 * Create a full mock OpenClaw API that records all method calls.
 */
export function createMockAPI(workspacePath: string): MockAPI {
  const calls: MockAPICall[] = [];
  return {
    workspaceDir: workspacePath,
    registerCli: (cb: Function, opts: unknown) => {
      calls.push({ method: 'registerCli', args: [opts] });
      cb({ program: { command: () => ({ description: () => ({ action: () => {} }) }) } });
    },
    registerService: (config: unknown) => {
      calls.push({ method: 'registerService', args: [config] });
    },
    registerCommand: (config: unknown) => {
      calls.push({ method: 'registerCommand', args: [config] });
    },
    on: (event: string, handler: Function) => {
      calls.push({ method: 'on', args: [event, handler] });
    },
    log: (level: string, msg: string, data?: unknown) => {
      calls.push({ method: 'log', args: [level, msg, data] });
    },
    calls,
  };
}

/**
 * Create a minimal mock API with only workspaceDir (no methods).
 * Used for testing graceful degradation when methods are unavailable.
 */
export function createMinimalAPI(workspacePath: string): { workspaceDir: string } {
  return { workspaceDir: workspacePath };
}
