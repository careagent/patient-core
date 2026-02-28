/**
 * Telegram Bot API HTTP client -- zero npm dependencies.
 *
 * Uses Node.js built-in `fetch` to communicate with the Telegram Bot API.
 * All responses are validated against TypeBox schemas.
 */

import { Value } from '@sinclair/typebox/value';
import {
  TelegramGetUpdatesResponseSchema,
  TelegramSendMessageResponseSchema,
  type TelegramUpdate,
  type TelegramSendMessageResponse,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Abstraction over the Telegram Bot API HTTP calls for testability. */
export interface TelegramTransport {
  sendMessage(chatId: number, text: string): Promise<TelegramSendMessageResponse>;
  getUpdates(offset?: number, timeout?: number): Promise<TelegramUpdate[]>;
}

// ---------------------------------------------------------------------------
// HTTP Transport (production)
// ---------------------------------------------------------------------------

/**
 * Create a TelegramTransport backed by the real Telegram Bot API.
 *
 * @param botToken - The Telegram bot token from BotFather.
 */
export function createTelegramTransport(botToken: string): TelegramTransport {
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  return {
    async sendMessage(chatId: number, text: string): Promise<TelegramSendMessageResponse> {
      const res = await fetch(`${baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });

      const data = await res.json();

      if (!Value.Check(TelegramSendMessageResponseSchema, data)) {
        throw new Error('Invalid Telegram sendMessage response');
      }

      return data;
    },

    async getUpdates(offset?: number, timeout = 30): Promise<TelegramUpdate[]> {
      const params = new URLSearchParams();
      if (offset !== undefined) params.set('offset', String(offset));
      params.set('timeout', String(timeout));

      const res = await fetch(`${baseUrl}/getUpdates?${params.toString()}`);
      const data = await res.json();

      if (!Value.Check(TelegramGetUpdatesResponseSchema, data)) {
        throw new Error('Invalid Telegram getUpdates response');
      }

      return data.result;
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Transport (testing)
// ---------------------------------------------------------------------------

export interface MockTransportRecord {
  method: 'sendMessage' | 'getUpdates';
  args: unknown[];
}

/**
 * Create a mock TelegramTransport for testing.
 *
 * Records all calls and returns configurable responses.
 */
export function createMockTransport(): TelegramTransport & {
  calls: MockTransportRecord[];
  queueUpdates(updates: TelegramUpdate[]): void;
  getSentMessages(): Array<{ chatId: number; text: string }>;
} {
  const calls: MockTransportRecord[] = [];
  const updateQueue: TelegramUpdate[][] = [];
  const sentMessages: Array<{ chatId: number; text: string }> = [];

  return {
    calls,

    queueUpdates(updates: TelegramUpdate[]): void {
      updateQueue.push(updates);
    },

    getSentMessages(): Array<{ chatId: number; text: string }> {
      return sentMessages;
    },

    async sendMessage(chatId: number, text: string): Promise<TelegramSendMessageResponse> {
      calls.push({ method: 'sendMessage', args: [chatId, text] });
      sentMessages.push({ chatId, text });
      return {
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 100000),
          chat: { id: chatId, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text,
        },
      };
    },

    async getUpdates(offset?: number, timeout?: number): Promise<TelegramUpdate[]> {
      calls.push({ method: 'getUpdates', args: [offset, timeout] });
      return updateQueue.shift() ?? [];
    },
  };
}
