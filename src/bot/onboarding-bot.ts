/**
 * Telegram onboarding bot -- orchestrates the patient onboarding flow.
 *
 * Wires together:
 * - TelegramTransport (HTTP client for Telegram Bot API)
 * - State machine (pure state transitions)
 * - Keypair generation (Ed25519)
 * - CANS.md generation
 * - Chart vault integration (patient profile storage)
 * - OpenClaw plugin activation
 *
 * The bot uses long polling to receive updates. Each chat has an independent
 * onboarding session tracked in an in-memory Map.
 */

import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TelegramTransport } from './telegram-client.js';
import type { PatientSession, TelegramUpdate } from './schemas.js';
import { processInput } from './state-machine.js';
import { generatePatientKeypair } from './keypair.js';
import { generateCANS } from '../onboarding/cans-generator.js';
import { computeHash } from '../activation/cans-integrity.js';
import type { PatientChartClient } from '../chart/types.js';
import type { DiscoveryHandshake } from '../discovery/handshake.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingBotConfig {
  transport: TelegramTransport;
  workspacePath: string;
  chartVault?: PatientChartClient;
  onActivation?: (cansPath: string) => void | Promise<void>;
  discoveryHandshake?: DiscoveryHandshake;
}

export interface OnboardingBot {
  /** Process a single Telegram update. */
  handleUpdate(update: TelegramUpdate): Promise<void>;
  /** Start long-polling loop (production). Returns a stop function. */
  startPolling(): { stop: () => void };
  /** Get all sessions (for testing). */
  getSessions(): Map<number, PatientSession>;
  /** Get a specific session by chat ID. */
  getSession(chatId: number): PatientSession | undefined;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an onboarding bot instance.
 *
 * The bot manages per-chat sessions and drives the onboarding state machine.
 * Side effects (keypair, chart write, CANS.md) happen on ENROLLED transition.
 */
export function createOnboardingBot(config: OnboardingBotConfig): OnboardingBot {
  const { transport, workspacePath, chartVault, onActivation, discoveryHandshake } = config;
  const sessions = new Map<number, PatientSession>();

  /** Get or create a session for a chat. */
  function getOrCreateSession(chatId: number): PatientSession {
    let session = sessions.get(chatId);
    if (!session) {
      session = {
        chat_id: chatId,
        state: 'START',
        created_at: new Date().toISOString(),
      };
      sessions.set(chatId, session);
    }
    return session;
  }

  /** Handle enrollment side effects: keypair, chart write, CANS.md, activation. */
  async function handleEnrollment(session: PatientSession, patientName: string): Promise<void> {
    // 1. Generate Ed25519 keypair
    const keypair = generatePatientKeypair();

    // 2. Generate patient ID
    const patientId = randomUUID();

    // 3. Update session
    session.patient_id = patientId;
    session.public_key = keypair.publicKeyBase64;
    session.consented = true;

    // 4. Store in chart vault if available
    if (chartVault) {
      chartVault.writeEntry(
        {
          patient_id: patientId,
          patient_name: patientName,
          public_key: keypair.publicKeyBase64,
          consented: true,
          onboarded_at: new Date().toISOString(),
        },
        'patient_preference',
      );
    }

    // 5. Generate and write CANS.md
    const cansContent = generateCANS({
      patient_id: patientId,
      public_key: keypair.publicKeyBase64,
    });
    const cansPath = join(workspacePath, 'CANS.md');
    await writeFile(cansPath, cansContent, 'utf8');

    // 6. Write integrity sidecar
    const hash = computeHash(cansContent);
    await writeFile(join(workspacePath, '.CANS.md.sha256'), hash, 'utf8');

    // 7. Trigger OpenClaw activation callback
    if (onActivation) {
      await onActivation(cansPath);
    }
  }

  /** Handle NPI discovery and handshake, reporting results back to the chat. */
  async function handleDiscovery(session: PatientSession, chatId: number, npi: string): Promise<void> {
    if (!discoveryHandshake) {
      await transport.sendMessage(chatId, 'Provider discovery is not configured.');
      return;
    }

    if (!session.patient_id || !session.public_key) {
      await transport.sendMessage(chatId, 'Please complete onboarding first.');
      return;
    }

    try {
      // Re-generate keypair for signing (private key is not stored in session)
      // In production, private key would be retrieved from secure storage.
      // For now, we require the caller to provide discoveryHandshake with
      // keys already configured. The bot uses the session's stored keypair reference.
      const keypair = generatePatientKeypair();

      const result = await discoveryHandshake.discoverAndConnect(
        npi,
        session.patient_id,
        keypair.privateKey,
        keypair.publicKey,
      );

      if (!result.discovery.found) {
        const reason = result.discovery.error ?? 'No provider found';
        await transport.sendMessage(
          chatId,
          `No provider found for NPI ${npi}. ${reason}`,
        );
        return;
      }

      const providerName = result.discovery.provider?.name ?? 'Unknown Provider';

      if (!result.handshake) {
        await transport.sendMessage(
          chatId,
          `Found ${providerName}, but could not initiate connection.`,
        );
        return;
      }

      switch (result.handshake.status) {
        case 'granted':
          await transport.sendMessage(
            chatId,
            `Connected to ${providerName}! Connection established successfully.`,
          );
          break;
        case 'denied':
          await transport.sendMessage(
            chatId,
            `Connection to ${providerName} was denied: ${result.handshake.denialMessage ?? 'Unknown reason'}.`,
          );
          break;
        case 'error':
          await transport.sendMessage(
            chatId,
            `Error connecting to ${providerName}: ${result.handshake.error ?? 'Unknown error'}.`,
          );
          break;
      }
    } catch {
      await transport.sendMessage(
        chatId,
        `An error occurred while searching for provider with NPI ${npi}. Please try again.`,
      );
    }
  }

  async function handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text || !message.chat) return;

    const chatId = message.chat.id;
    const text = message.text;
    const session = getOrCreateSession(chatId);

    // Run pure state transition
    const result = processInput(session, text);

    // Update session state
    const previousState = session.state;
    session.state = result.nextState;

    // Capture name when transitioning to AWAITING_CONSENT
    if (previousState === 'AWAITING_NAME' && result.nextState === 'AWAITING_CONSENT') {
      session.patient_name = text.trim();
    }

    // Handle enrollment side effects
    if (result.enrollmentData && result.nextState === 'ENROLLED') {
      try {
        await handleEnrollment(session, result.enrollmentData.patientName);
      } catch {
        // Enrollment side effects failed -- revert state
        session.state = 'AWAITING_CONSENT';
        await transport.sendMessage(
          chatId,
          'An error occurred during enrollment. Please try again by responding "yes".',
        );
        return;
      }
    }

    // Send response
    await transport.sendMessage(chatId, result.response);

    // Handle NPI discovery (async, after initial response)
    if (result.discoveryNpi) {
      await handleDiscovery(session, chatId, result.discoveryNpi);
    }
  }

  function startPolling(): { stop: () => void } {
    let running = true;
    let offset: number | undefined;

    const poll = async (): Promise<void> => {
      while (running) {
        try {
          const updates = await transport.getUpdates(offset, 30);
          for (const update of updates) {
            offset = update.update_id + 1;
            await handleUpdate(update);
          }
        } catch {
          // Network error -- wait before retrying
          if (running) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }
      }
    };

    // Start polling loop (fire-and-forget)
    poll();

    return {
      stop(): void {
        running = false;
      },
    };
  }

  return {
    handleUpdate,
    startPolling,
    getSessions(): Map<number, PatientSession> {
      return sessions;
    },
    getSession(chatId: number): PatientSession | undefined {
      return sessions.get(chatId);
    },
  };
}
