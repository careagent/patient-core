/**
 * Tests for Telegram transport client (mock transport).
 *
 * Tests the mock transport used throughout the test suite, and
 * validates that the production transport factory exists.
 */

import { describe, it, expect } from 'vitest';
import {
  createMockTransport,
  createTelegramTransport,
} from '../../../src/bot/telegram-client.js';
import type { TelegramUpdate } from '../../../src/bot/schemas.js';

describe('createMockTransport', () => {
  it('records sendMessage calls', async () => {
    const transport = createMockTransport();
    await transport.sendMessage(123, 'Hello');

    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].method).toBe('sendMessage');
    expect(transport.calls[0].args).toEqual([123, 'Hello']);
  });

  it('tracks sent messages', async () => {
    const transport = createMockTransport();
    await transport.sendMessage(123, 'Hello');
    await transport.sendMessage(456, 'World');

    const messages = transport.getSentMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ chatId: 123, text: 'Hello' });
    expect(messages[1]).toEqual({ chatId: 456, text: 'World' });
  });

  it('returns ok: true from sendMessage', async () => {
    const transport = createMockTransport();
    const response = await transport.sendMessage(123, 'Hello');

    expect(response.ok).toBe(true);
    expect(response.result).toBeDefined();
    expect(response.result!.chat.id).toBe(123);
  });

  it('returns queued updates from getUpdates', async () => {
    const transport = createMockTransport();
    const updates: TelegramUpdate[] = [
      { update_id: 1, message: { message_id: 1, chat: { id: 999, type: 'private' }, date: 1000, text: '/start' } },
    ];
    transport.queueUpdates(updates);

    const result = await transport.getUpdates();
    expect(result).toEqual(updates);
  });

  it('returns empty array when no updates queued', async () => {
    const transport = createMockTransport();
    const result = await transport.getUpdates();
    expect(result).toEqual([]);
  });

  it('records getUpdates calls with offset and timeout', async () => {
    const transport = createMockTransport();
    await transport.getUpdates(42, 10);

    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].method).toBe('getUpdates');
    expect(transport.calls[0].args).toEqual([42, 10]);
  });
});

describe('createTelegramTransport', () => {
  it('is a function that returns a transport object', () => {
    // We don't test HTTP calls here (no live Telegram connection).
    // Just verify the factory returns the expected shape.
    const transport = createTelegramTransport('fake-token');
    expect(typeof transport.sendMessage).toBe('function');
    expect(typeof transport.getUpdates).toBe('function');
  });
});
