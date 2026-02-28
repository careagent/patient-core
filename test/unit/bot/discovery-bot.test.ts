/**
 * Tests for Telegram bot NPI discovery integration.
 *
 * Verifies that the bot correctly triggers discovery when an enrolled
 * patient enters an NPI number, and reports results back to the chat.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createOnboardingBot } from '../../../src/bot/onboarding-bot.js';
import { createMockTransport } from '../../../src/bot/telegram-client.js';
import type { DiscoveryHandshake, DiscoveryAndHandshakeResult } from '../../../src/discovery/handshake.js';
import type { TelegramUpdate } from '../../../src/bot/schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUpdate(chatId: number, text: string, updateId: number): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: chatId, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
}

function makeDiscoveryHandshake(
  resultOverride?: Partial<DiscoveryAndHandshakeResult>,
): DiscoveryHandshake {
  const defaultResult: DiscoveryAndHandshakeResult = {
    discovery: {
      found: true,
      provider: {
        npi: '1234567890',
        entity_type: 'individual',
        name: 'Dr. Smith',
        credential_status: 'active',
        credentials: [],
        registered_at: '2025-01-01T00:00:00Z',
        last_updated: '2025-06-01T00:00:00Z',
        registry_version: '1.0.0',
      },
      neuronEndpoint: 'https://neuron.example.com/ws',
    },
    handshake: {
      status: 'granted',
      connectionId: 'conn-123',
      neuronEndpoint: 'https://neuron.example.com/ws',
    },
    ledgerEntry: {
      type: 'handshake',
      timestamp: new Date().toISOString(),
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
      status: 'granted',
      connection_id: 'conn-123',
      neuron_endpoint: 'https://neuron.example.com/ws',
      denial_code: undefined,
      error: undefined,
    },
  };

  const result = { ...defaultResult, ...resultOverride };

  return {
    discoverAndConnect: vi.fn().mockResolvedValue(result),
    discover: vi.fn().mockResolvedValue(result.discovery),
  };
}

/** Enroll a patient through the full onboarding flow. */
async function enrollPatient(
  bot: ReturnType<typeof createOnboardingBot>,
  chatId: number,
) {
  await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
  await bot.handleUpdate(makeUpdate(chatId, 'Alice', 2));
  await bot.handleUpdate(makeUpdate(chatId, 'yes', 3));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bot NPI Discovery', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = join(tmpdir(), `discovery-bot-test-${randomUUID()}`);
    await mkdir(workspacePath, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  describe('successful discovery and connection', () => {
    it('sends search message then connected message on grant', async () => {
      const transport = createMockTransport();
      const dh = makeDiscoveryHandshake();
      const bot = createOnboardingBot({
        transport,
        workspacePath,
        discoveryHandshake: dh,
      });

      const chatId = 100;
      await enrollPatient(bot, chatId);
      await bot.handleUpdate(makeUpdate(chatId, '1234567890', 4));

      const messages = transport.getSentMessages();
      const searchMsg = messages.find((m) => m.text.includes('Searching'));
      expect(searchMsg).toBeDefined();
      expect(searchMsg!.text).toContain('1234567890');

      const connectedMsg = messages.find((m) => m.text.includes('Connected'));
      expect(connectedMsg).toBeDefined();
      expect(connectedMsg!.text).toContain('Dr. Smith');
    });

    it('calls discoverAndConnect with the NPI', async () => {
      const transport = createMockTransport();
      const dh = makeDiscoveryHandshake();
      const bot = createOnboardingBot({
        transport,
        workspacePath,
        discoveryHandshake: dh,
      });

      const chatId = 101;
      await enrollPatient(bot, chatId);
      await bot.handleUpdate(makeUpdate(chatId, '1234567890', 4));

      expect(dh.discoverAndConnect).toHaveBeenCalledTimes(1);
      const [npi] = (dh.discoverAndConnect as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
      expect(npi).toBe('1234567890');
    });
  });

  describe('provider not found', () => {
    it('sends not-found message when provider does not exist', async () => {
      const transport = createMockTransport();
      const dh = makeDiscoveryHandshake({
        discovery: { found: false },
        handshake: undefined,
        ledgerEntry: undefined,
      });
      const bot = createOnboardingBot({
        transport,
        workspacePath,
        discoveryHandshake: dh,
      });

      const chatId = 102;
      await enrollPatient(bot, chatId);
      await bot.handleUpdate(makeUpdate(chatId, '0000000000', 4));

      const messages = transport.getSentMessages();
      const notFoundMsg = messages.find((m) => m.text.includes('No provider found'));
      expect(notFoundMsg).toBeDefined();
    });
  });

  describe('handshake denied', () => {
    it('sends denial message with reason', async () => {
      const transport = createMockTransport();
      const dh = makeDiscoveryHandshake({
        handshake: {
          status: 'denied',
          connectionId: 'conn-456',
          denialCode: 'CREDENTIALS_INVALID',
          denialMessage: 'Provider credentials are not in active status',
        },
      });
      const bot = createOnboardingBot({
        transport,
        workspacePath,
        discoveryHandshake: dh,
      });

      const chatId = 103;
      await enrollPatient(bot, chatId);
      await bot.handleUpdate(makeUpdate(chatId, '1234567890', 4));

      const messages = transport.getSentMessages();
      const deniedMsg = messages.find((m) => m.text.includes('denied'));
      expect(deniedMsg).toBeDefined();
      expect(deniedMsg!.text).toContain('Dr. Smith');
    });
  });

  describe('handshake error', () => {
    it('sends error message on connection failure', async () => {
      const transport = createMockTransport();
      const dh = makeDiscoveryHandshake({
        handshake: {
          status: 'error',
          error: 'Network timeout',
        },
      });
      const bot = createOnboardingBot({
        transport,
        workspacePath,
        discoveryHandshake: dh,
      });

      const chatId = 104;
      await enrollPatient(bot, chatId);
      await bot.handleUpdate(makeUpdate(chatId, '1234567890', 4));

      const messages = transport.getSentMessages();
      const errorMsg = messages.find((m) => m.text.includes('Error connecting'));
      expect(errorMsg).toBeDefined();
    });
  });

  describe('discovery not configured', () => {
    it('sends not-configured message when discoveryHandshake is not provided', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({
        transport,
        workspacePath,
        // No discoveryHandshake
      });

      const chatId = 105;
      await enrollPatient(bot, chatId);
      await bot.handleUpdate(makeUpdate(chatId, '1234567890', 4));

      const messages = transport.getSentMessages();
      const notConfigured = messages.find((m) => m.text.includes('not configured'));
      expect(notConfigured).toBeDefined();
    });
  });

  describe('exception handling', () => {
    it('sends error message when discovery throws', async () => {
      const transport = createMockTransport();
      const dh: DiscoveryHandshake = {
        discoverAndConnect: vi.fn().mockRejectedValue(new Error('Unexpected error')),
        discover: vi.fn().mockRejectedValue(new Error('Unexpected error')),
      };
      const bot = createOnboardingBot({
        transport,
        workspacePath,
        discoveryHandshake: dh,
      });

      const chatId = 106;
      await enrollPatient(bot, chatId);
      await bot.handleUpdate(makeUpdate(chatId, '1234567890', 4));

      const messages = transport.getSentMessages();
      const errorMsg = messages.find((m) => m.text.includes('error occurred'));
      expect(errorMsg).toBeDefined();
    });
  });

  describe('non-NPI input from enrolled patient', () => {
    it('does not trigger discovery for non-NPI text', async () => {
      const transport = createMockTransport();
      const dh = makeDiscoveryHandshake();
      const bot = createOnboardingBot({
        transport,
        workspacePath,
        discoveryHandshake: dh,
      });

      const chatId = 107;
      await enrollPatient(bot, chatId);
      await bot.handleUpdate(makeUpdate(chatId, 'hello', 4));

      expect(dh.discoverAndConnect).not.toHaveBeenCalled();
    });
  });
});
