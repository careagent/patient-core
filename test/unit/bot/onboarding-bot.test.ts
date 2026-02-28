/**
 * Integration tests for the onboarding bot.
 *
 * Tests the full onboarding flow through the bot without a live
 * Telegram connection, using the mock transport.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createOnboardingBot } from '../../../src/bot/onboarding-bot.js';
import { createMockTransport } from '../../../src/bot/telegram-client.js';
import type { TelegramUpdate } from '../../../src/bot/schemas.js';
import type { PatientChartVault, ChartOperationResult } from '../../../src/chart/types.js';

// Helper: create a Telegram update
function makeUpdate(chatId: number, text: string, updateId = 1): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      chat: { id: chatId, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
}

// Helper: create a mock chart vault
function createMockVault(): PatientChartVault & { written: Array<{ recordId: string; data: unknown }> } {
  const written: Array<{ recordId: string; data: unknown }> = [];
  return {
    written,
    async read(_recordId: string): Promise<unknown> {
      return null;
    },
    async write(recordId: string, data: unknown): Promise<ChartOperationResult> {
      written.push({ recordId, data });
      return { success: true };
    },
    async checkAccess(_recordId: string): Promise<boolean> {
      return true;
    },
  };
}

describe('OnboardingBot', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = join(tmpdir(), `bot-test-${randomUUID()}`);
    await mkdir(workspacePath, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Full onboarding flow
  // -------------------------------------------------------------------------
  describe('Full onboarding flow', () => {
    it('completes /start -> name -> consent yes -> enrolled', async () => {
      const transport = createMockTransport();
      const vault = createMockVault();
      let activationCalled = false;

      const bot = createOnboardingBot({
        transport,
        workspacePath,
        chartVault: vault,
        onActivation: () => { activationCalled = true; },
      });

      const chatId = 12345;

      // Step 1: /start
      await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
      expect(transport.getSentMessages()).toHaveLength(1);
      expect(transport.getSentMessages()[0].text).toContain('name');

      // Step 2: send name
      await bot.handleUpdate(makeUpdate(chatId, 'Alice Smith', 2));
      expect(transport.getSentMessages()).toHaveLength(2);
      expect(transport.getSentMessages()[1].text).toContain('Alice Smith');
      expect(transport.getSentMessages()[1].text).toContain('consent');

      // Step 3: consent yes
      await bot.handleUpdate(makeUpdate(chatId, 'yes', 3));
      expect(transport.getSentMessages()).toHaveLength(3);
      expect(transport.getSentMessages()[2].text).toContain('enrolled');

      // Verify session state
      const session = bot.getSession(chatId);
      expect(session).toBeDefined();
      expect(session!.state).toBe('ENROLLED');
      expect(session!.patient_name).toBe('Alice Smith');
      expect(session!.consented).toBe(true);
      expect(session!.patient_id).toBeDefined();
      expect(session!.public_key).toBeDefined();

      // Verify chart vault write
      expect(vault.written).toHaveLength(1);
      expect(vault.written[0].recordId).toContain('patient:');
      const data = vault.written[0].data as Record<string, unknown>;
      expect(data.patient_name).toBe('Alice Smith');
      expect(data.public_key).toBeDefined();
      expect(data.consented).toBe(true);

      // Verify CANS.md created
      const cansContent = await readFile(join(workspacePath, 'CANS.md'), 'utf8');
      expect(cansContent).toContain('identity_type: patient');
      expect(cansContent).toContain('consent_posture: deny');

      // Verify integrity sidecar created
      const sidecar = await readFile(join(workspacePath, '.CANS.md.sha256'), 'utf8');
      expect(sidecar).toBeTruthy();

      // Verify activation callback called
      expect(activationCalled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Consent decline flow
  // -------------------------------------------------------------------------
  describe('Consent decline flow', () => {
    it('/start -> name -> consent no -> declined', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      const chatId = 111;

      await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
      await bot.handleUpdate(makeUpdate(chatId, 'Bob', 2));
      await bot.handleUpdate(makeUpdate(chatId, 'no', 3));

      const session = bot.getSession(chatId);
      expect(session!.state).toBe('DECLINED');
      expect(transport.getSentMessages()[2].text).toContain('restart');
    });

    it('declined user can restart with /start', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      const chatId = 222;

      // Go through decline flow
      await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
      await bot.handleUpdate(makeUpdate(chatId, 'Bob', 2));
      await bot.handleUpdate(makeUpdate(chatId, 'no', 3));
      expect(bot.getSession(chatId)!.state).toBe('DECLINED');

      // Restart
      await bot.handleUpdate(makeUpdate(chatId, '/start', 4));
      expect(bot.getSession(chatId)!.state).toBe('AWAITING_NAME');
    });
  });

  // -------------------------------------------------------------------------
  // Invalid input handling
  // -------------------------------------------------------------------------
  describe('Invalid input handling', () => {
    it('ignores updates without text', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 999, type: 'private' },
          date: 1000,
        },
      });

      expect(transport.getSentMessages()).toHaveLength(0);
    });

    it('ignores updates without message', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      await bot.handleUpdate({ update_id: 1 });

      expect(transport.getSentMessages()).toHaveLength(0);
    });

    it('invalid name re-prompts', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      const chatId = 333;

      await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
      await bot.handleUpdate(makeUpdate(chatId, '', 2)); // empty
      expect(bot.getSession(chatId)!.state).toBe('AWAITING_NAME');

      await bot.handleUpdate(makeUpdate(chatId, '123abc!!!', 3)); // invalid chars
      expect(bot.getSession(chatId)!.state).toBe('AWAITING_NAME');

      // Valid name works
      await bot.handleUpdate(makeUpdate(chatId, 'Alice', 4));
      expect(bot.getSession(chatId)!.state).toBe('AWAITING_CONSENT');
    });

    it('gibberish consent re-prompts', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      const chatId = 444;

      await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
      await bot.handleUpdate(makeUpdate(chatId, 'Alice', 2));

      // Gibberish
      await bot.handleUpdate(makeUpdate(chatId, 'maybe', 3));
      expect(bot.getSession(chatId)!.state).toBe('AWAITING_CONSENT');

      await bot.handleUpdate(makeUpdate(chatId, 'sure', 4));
      expect(bot.getSession(chatId)!.state).toBe('AWAITING_CONSENT');

      // Valid consent works
      await bot.handleUpdate(makeUpdate(chatId, 'yes', 5));
      expect(bot.getSession(chatId)!.state).toBe('ENROLLED');
    });
  });

  // -------------------------------------------------------------------------
  // Multiple chats
  // -------------------------------------------------------------------------
  describe('Multiple chats', () => {
    it('tracks independent sessions per chat', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      // Chat A starts
      await bot.handleUpdate(makeUpdate(100, '/start', 1));
      // Chat B starts
      await bot.handleUpdate(makeUpdate(200, '/start', 2));

      expect(bot.getSession(100)!.state).toBe('AWAITING_NAME');
      expect(bot.getSession(200)!.state).toBe('AWAITING_NAME');

      // Chat A gives name
      await bot.handleUpdate(makeUpdate(100, 'Alice', 3));
      expect(bot.getSession(100)!.state).toBe('AWAITING_CONSENT');
      expect(bot.getSession(200)!.state).toBe('AWAITING_NAME');
    });
  });

  // -------------------------------------------------------------------------
  // Already enrolled
  // -------------------------------------------------------------------------
  describe('Already enrolled', () => {
    it('/start from enrolled returns already enrolled', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      const chatId = 555;

      // Complete enrollment
      await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
      await bot.handleUpdate(makeUpdate(chatId, 'Alice', 2));
      await bot.handleUpdate(makeUpdate(chatId, 'yes', 3));
      expect(bot.getSession(chatId)!.state).toBe('ENROLLED');

      // Try /start again
      await bot.handleUpdate(makeUpdate(chatId, '/start', 4));
      expect(bot.getSession(chatId)!.state).toBe('ENROLLED');
      expect(transport.getSentMessages()[3].text).toContain('already enrolled');
    });
  });

  // -------------------------------------------------------------------------
  // Pairing initiation (stub)
  // -------------------------------------------------------------------------
  describe('Pairing initiation', () => {
    it('enrolled patient can enter NPI to begin pairing', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      const chatId = 666;

      // Complete enrollment
      await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
      await bot.handleUpdate(makeUpdate(chatId, 'Alice', 2));
      await bot.handleUpdate(makeUpdate(chatId, 'yes', 3));

      // Enter NPI
      await bot.handleUpdate(makeUpdate(chatId, '1234567890', 4));
      const messages = transport.getSentMessages();
      expect(messages[3].text).toContain('Searching');
    });
  });

  // -------------------------------------------------------------------------
  // Enrollment without chart vault
  // -------------------------------------------------------------------------
  describe('Enrollment without chart vault', () => {
    it('succeeds even without a chart vault', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });
      // No chartVault provided

      const chatId = 777;

      await bot.handleUpdate(makeUpdate(chatId, '/start', 1));
      await bot.handleUpdate(makeUpdate(chatId, 'Alice', 2));
      await bot.handleUpdate(makeUpdate(chatId, 'yes', 3));

      expect(bot.getSession(chatId)!.state).toBe('ENROLLED');
      expect(bot.getSession(chatId)!.patient_id).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getSessions
  // -------------------------------------------------------------------------
  describe('getSessions', () => {
    it('returns all active sessions', async () => {
      const transport = createMockTransport();
      const bot = createOnboardingBot({ transport, workspacePath });

      await bot.handleUpdate(makeUpdate(100, '/start', 1));
      await bot.handleUpdate(makeUpdate(200, '/start', 2));

      const sessions = bot.getSessions();
      expect(sessions.size).toBe(2);
      expect(sessions.has(100)).toBe(true);
      expect(sessions.has(200)).toBe(true);
    });
  });
});
