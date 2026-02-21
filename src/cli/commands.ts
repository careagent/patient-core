/**
 * CLI command registration -- registers careagent CLI commands with the adapter.
 *
 * Mirrors provider-core's commands.ts.
 */

import type { PlatformAdapter } from '../adapters/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import { createTerminalIO } from './io.js';
import { runInitCommand } from './init-command.js';
import { runStatusCommand } from './status-command.js';

export function registerCLI(
  adapter: PlatformAdapter,
  workspacePath: string,
  audit: AuditPipeline,
): void {
  adapter.registerCliCommand({
    name: 'careagent init',
    description: 'Initialize CareAgent with a patient onboarding interview',
    handler: async () => {
      const io = createTerminalIO();
      await runInitCommand(io, workspacePath, audit);
    },
  });

  adapter.registerCliCommand({
    name: 'careagent status',
    description: 'Show CareAgent activation state and system health',
    handler: () => {
      runStatusCommand(workspacePath);
    },
  });
}
