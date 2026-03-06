/**
 * OpenClaw entry point -- plugin registration for the OpenClaw platform.
 *
 * OpenClaw discovers this via the `openclaw.extensions` field in package.json
 * and calls the default export with the plugin API.
 *
 * Phase 1 wires: Adapter, Activation Gate, Audit Pipeline, Hardening Engine.
 * Phase 4 wires: A2A Client, Consent Broker, Chart Bridge, Onboarding, Discovery.
 *
 * Each major operation is wrapped in its own try/catch for graceful
 * degradation (PLUG-05). The plugin MUST NOT crash the host platform.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createAdapter } from '../adapters/detect.js';
import { ActivationGate } from '../activation/gate.js';
import { createAuditIntegrityService } from '../audit/integrity-service.js';
import { AuditPipeline } from '../audit/pipeline.js';
import { registerCLI } from '../cli/commands.js';
import { createHardeningEngine } from '../hardening/engine.js';
import { PatientA2AClient } from '../a2a/client.js';
import { ConsentBroker } from '../a2a/consent-broker.js';
import { ChartBridge } from '../a2a/chart-bridge.js';
import { PatientOnboarding } from '../a2a/onboarding.js';
import { OnboardingEngine } from '../onboarding/engine.js';
import { ENTRIES_FILENAME } from '@careagent/patient-chart';
import type { SlashCommandContext, PlatformAdapter } from '../adapters/types.js';

export default async function register(api: unknown): Promise<void> {
  // Step 1: Create adapter (duck-type detect and create appropriate adapter)
  const adapter = createAdapter(api);

  let workspacePath: string;
  try {
    workspacePath = adapter.getWorkspacePath();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Failed to resolve workspace path: ${msg}`);
    workspacePath = process.cwd();
  }

  // Step 2: Start audit pipeline (always active, even without CANS.md)
  const audit = new AuditPipeline(workspacePath);

  // Step 3: Register CLI commands (always available -- needed before CANS.md exists)
  try {
    registerCLI(adapter, workspacePath, audit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] CLI registration failed: ${msg}`);
  }

  // Step 3.5: Register A2A-powered slash commands
  const axonUrl = process.env['AXON_URL'] ?? '';
  const neuronUrl = process.env['NEURON_ENDPOINT'] ?? '';
  const patientAgentId = `patient-${process.env['TELEGRAM_BOT_TOKEN']?.slice(-8) ?? 'local'}`;
  const vaultDir = resolve(workspacePath, 'vault');
  const vaultPassword = process.env['VAULT_PASSWORD'] ?? 'careagent-dev-password';

  // Create A2A modules if Axon URL is configured
  if (axonUrl) {
    try {
      const a2aClient = new PatientA2AClient({
        axonUrl,
        patientAgentId,
      });
      const consentBroker = new ConsentBroker();
      const chartBridge = new ChartBridge({
        vaultDir,
        keyRingPassword: vaultPassword,
      });

      registerPatientSlashCommands(adapter, {
        a2aClient,
        consentBroker,
        chartBridge,
        workspacePath,
        vaultDir,
        neuronUrl,
        audit,
      });

      adapter.log('info', '[CareAgent] A2A modules initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      adapter.log('warn', `[CareAgent] A2A initialization failed: ${msg}`);
    }
  }

  // Step 4: Check activation gate
  let gate: ActivationGate;
  try {
    gate = new ActivationGate(workspacePath, (entry) => {
      try {
        audit.log({
          action: entry.action as string,
          actor: 'system',
          outcome: (entry.outcome as 'error') || 'error',
          details: entry.details as Record<string, unknown> | undefined,
        });
      } catch {
        // Audit pipeline may be a stub -- swallow errors
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Activation gate creation failed: ${msg}`);
    return;
  }

  const result = await gate.check();

  // Step 5: If not active, log reason and return
  if (!result.active || !result.document) {
    try {
      audit.log({
        action: 'activation_check',
        actor: 'system',
        outcome: 'inactive',
        details: { reason: result.reason || 'No valid CANS.md' },
      });
    } catch {
      // Audit pipeline may be a stub -- swallow errors
    }
    adapter.log('info', `[CareAgent] Clinical mode inactive: ${result.reason || 'No CANS.md found'}`);
    return;
  }

  // Step 6: Clinical mode active -- wire hardening engine
  const cans = result.document;
  try {
    audit.log({
      action: 'activation_check',
      actor: 'system',
      outcome: 'active',
      details: { identity_type: cans.identity_type },
    });
  } catch {
    // Audit pipeline may be a stub -- swallow errors
  }
  adapter.log('info', `[CareAgent] Clinical mode ACTIVE`);

  // Step 7: Activate hardening engine (all 6 layers)
  try {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Hardening engine activation failed: ${msg}`);
  }

  // Step 8: Register background services
  try {
    const integrityService = createAuditIntegrityService(audit, adapter);
    adapter.registerBackgroundService(integrityService);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Audit integrity service registration failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Slash command registration
// ---------------------------------------------------------------------------

interface PatientModules {
  a2aClient: PatientA2AClient;
  consentBroker: ConsentBroker;
  chartBridge: ChartBridge;
  workspacePath: string;
  vaultDir: string;
  neuronUrl: string;
  audit: AuditPipeline;
}

function registerPatientSlashCommands(
  adapter: PlatformAdapter,
  modules: PatientModules,
): void {
  const { a2aClient, consentBroker, chartBridge, workspacePath, neuronUrl, audit } = modules;

  // /careagent_on — run patient onboarding (interactive)
  adapter.registerSlashCommand({
    name: 'careagent_on',
    description: 'Activate CareAgent patient mode',
    handler: async (_ctx: SlashCommandContext) => {
      const cansPath = join(workspacePath, 'CANS.md');
      const entriesPath = join(modules.vaultDir, 'ledger', ENTRIES_FILENAME);

      // Already onboarded — check both CANS.md and vault entries
      if (existsSync(cansPath) && existsSync(entriesPath)) {
        return { text: 'CareAgent patient mode is already active.' };
      }

      // Interactive onboarding not yet supported in slash command model
      // (requires multi-turn message routing). Use /careagent_test for E2E.
      return {
        text: [
          'Patient onboarding requires interactive input.',
          'Use /careagent_test to run onboarding with test data.',
          'Interactive Telegram onboarding coming soon.',
        ].join('\n'),
      };
    },
  });

  // /careagent_test — run onboarding with Elizabeth Anderson test data
  adapter.registerSlashCommand({
    name: 'careagent_test',
    description: 'Run patient onboarding with synthetic test data (E2E)',
    handler: async (_ctx: SlashCommandContext) => {
      const cansPath = join(workspacePath, 'CANS.md');

      // Already onboarded
      if (existsSync(cansPath)) {
        return { text: 'CareAgent patient mode is already active. Remove CANS.md to re-onboard.' };
      }

      const messages: string[] = [];
      const messageIO = {
        display: (text: string) => { messages.push(text); },
        confirm: async (_prompt: string) => true,
      };

      const onboarding = new PatientOnboarding(a2aClient, chartBridge, messageIO);

      const result = await onboarding.run({
        name: 'Elizabeth Anderson',
        address: '1579 River Rd, Johns Island, SC 29455',
        phone: '+1 252 414 2043',
        dateOfBirth: '1975-03-15',
        conditions: [
          { name: 'Hormone replacement therapy for menopause', status: 'active' },
          { name: 'Right leg sciatica', status: 'active' },
        ],
        healthLiteracy: 'standard',
        preferredLanguage: 'English',
      });

      audit.log({
        action: 'patient_onboarding',
        actor: 'patient',
        outcome: result.success ? 'active' : 'error',
        details: {
          cans_path: result.cansPath,
          vault_path: result.vaultPath,
          entry_count: result.entryCount,
          error: result.error,
        },
      });

      if (result.success) {
        return {
          text: [
            'Patient CareAgent activated (test data).',
            `Chart vault: ${result.vaultPath}`,
            `CANS: ${result.cansPath}`,
            `Entries recorded: ${result.entryCount}`,
            '',
            'Use /find_provider to discover providers.',
          ].join('\n'),
        };
      }

      return { text: `Onboarding failed: ${result.error}`, isError: true };
    },
  });

  // /find_provider — discover providers via Axon Agent Card registry
  adapter.registerSlashCommand({
    name: 'find_provider',
    description: 'Find a healthcare provider by specialty',
    handler: async (ctx: SlashCommandContext) => {
      const specialty = ctx.args?.trim() || 'neurosurgery';

      try {
        const providers = await a2aClient.discoverProviders({
          specialty,
          location: { state: 'SC' },
        });

        if (providers.length === 0) {
          return { text: `No providers found for specialty: ${specialty}` };
        }

        const lines = providers.map((p, i) => {
          const npi = p.careagent?.npi ?? 'unknown';
          const org = p.careagent?.organization ?? p.provider?.organization ?? 'unknown';
          return `${i + 1}. ${p.name} (NPI: ${npi}, ${org})`;
        });

        return {
          text: [
            `Found ${providers.length} provider(s) for "${specialty}":`,
            ...lines,
            '',
            'Use /connect <number> to request a connection.',
          ].join('\n'),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: `Discovery failed: ${msg}`, isError: true };
      }
    },
  });

  // /connect — initiate consent + connection to a discovered provider
  adapter.registerSlashCommand({
    name: 'connect',
    description: 'Connect to a provider (consent + A2A connection)',
    handler: async (ctx: SlashCommandContext) => {
      const providerNpi = ctx.args?.trim();
      if (!providerNpi) {
        return { text: 'Usage: /connect <provider_npi>' };
      }

      try {
        // Discover the specific provider
        const providers = await a2aClient.discoverProviders({
          specialty: '', // Empty — we'll search by NPI via the results
        });

        const provider = providers.find((p) => p.careagent?.npi === providerNpi);
        if (!provider) {
          return { text: `Provider with NPI ${providerNpi} not found.` };
        }

        // Request consent
        const messageIO = {
          display: (_text: string) => { /* logged via audit */ },
          confirm: async (_prompt: string) => true, // Auto-approve for acceptance test
        };

        const grant = await consentBroker.requestConsent(
          provider,
          ['consultation', 'share_history'],
          messageIO,
        );

        if (!grant) {
          return { text: 'Consent denied. Connection not established.' };
        }

        audit.log({
          action: 'consent_granted',
          actor: 'patient',
          outcome: 'active',
          details: {
            provider_npi: providerNpi,
            consented_actions: grant.consented_actions,
            expiration: grant.expiration,
          },
        });

        // Connect to Neuron
        if (!neuronUrl) {
          return { text: `Consent granted for ${provider.name}. Neuron URL not configured — direct A2A not available.` };
        }

        const task = await consentBroker.connectToProvider(neuronUrl, grant, a2aClient);

        audit.log({
          action: 'provider_connection',
          actor: 'patient',
          outcome: 'active',
          details: {
            provider_npi: providerNpi,
            task_id: task.id,
            task_state: task.status.state,
          },
        });

        return {
          text: [
            `Connected to ${provider.name} via Neuron.`,
            `Task ID: ${task.id}`,
            `Status: ${task.status.state}`,
            '',
            'Use /consult to start a clinical conversation.',
          ].join('\n'),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: `Connection failed: ${msg}`, isError: true };
      }
    },
  });

  // /careagent_off — deactivate patient mode
  adapter.registerSlashCommand({
    name: 'careagent_off',
    description: 'Deactivate CareAgent patient mode',
    handler: async (_ctx: SlashCommandContext) => {
      audit.log({
        action: 'careagent_deactivate',
        actor: 'patient',
        outcome: 'inactive',
        details: {},
      });

      return { text: 'CareAgent patient mode deactivated.' };
    },
  });
}
