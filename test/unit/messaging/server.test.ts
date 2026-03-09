/**
 * Tests for the WebSocket messaging server — connection authentication,
 * message processing, and reconnection handling.
 *
 * Uses Node.js built-in net.Socket for raw WebSocket frames to test
 * the server without depending on the WebSocket global API.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { connect } from 'node:net';
import { createHash, generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { createMessagingServer, type MessagingServer } from '../../../src/messaging/server.js';
import { createMessagePipeline } from '../../../src/messaging/pipeline.js';
import { createConsentEngine } from '../../../src/consent/engine.js';
import { publicKeyToBase64Url } from '../../../src/discovery/crypto.js';
import type { KnownProvider } from '../../../src/messaging/schemas.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PATIENT_AGENT_ID = 'patient-server-test-001';
const PROVIDER_NPI = '1234567890';
const PROVIDER_NAME = 'Dr. Server Test';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0BE11CF5';

function makeKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubB64 = publicKeyToBase64Url(publicKey);
  const jwk = privateKey.export({ format: 'jwk' }) as { d: string };
  return { publicKey, privateKey, pubB64, privB64: jwk.d };
}

function providerSignObj(payload: Record<string, unknown>, privB64Url: string): string {
  const PKCS8_ED25519_PREFIX = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const data = Buffer.from(canonical, 'utf-8');
  const privKeyBytes = Buffer.from(privB64Url, 'base64url');
  const derKey = Buffer.concat([PKCS8_ED25519_PREFIX, privKeyBytes]);
  const { createPrivateKey } = require('node:crypto');
  const keyObject = createPrivateKey({ key: derKey, format: 'der', type: 'pkcs8' });
  return sign(null, data, keyObject).toString('base64url');
}

function createMockVault() {
  const entries: unknown[] = [];
  return {
    entries,
    writeEntry(content: unknown, _entryType: string) {
      entries.push(content);
      return {
        id: '00000000-0000-7000-8000-000000000001',
        timestamp: new Date().toISOString(),
        entry_type: _entryType,
        author: { type: 'patient_agent', id: 'test', display_name: 'Test', public_key: 'dGVzdA==' },
        prev_hash: null,
        signature: 'dGVzdA==',
        encrypted_payload: { ciphertext: 'dGVzdA==', iv: 'dGVzdA==', auth_tag: 'dGVzdA==', key_id: 'test-key' },
        metadata: { schema_version: '1', entry_type: _entryType, author_type: 'patient_agent', author_id: 'test', payload_size: 0 },
      } as any;
    },
  };
}

/** Build a minimal masked WebSocket text frame. */
function buildWsFrame(data: string): Buffer {
  const payload = Buffer.from(data, 'utf-8');
  const mask = randomBytes(4);
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | len; // masked
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    masked[i] = payload[i] ^ mask[i % 4];
  }

  return Buffer.concat([header, mask, masked]);
}

/** Decode an unmasked server text frame. */
function decodeServerFrame(buf: Buffer): string | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  if (opcode !== 0x01) return null; // not text
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;
  if (payloadLen === 126) {
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  return buf.subarray(offset, offset + payloadLen).toString('utf-8');
}

/** Connect to the server and do a WebSocket handshake. */
function wsConnect(port: number): Promise<{ socket: import('node:net').Socket; messages: string[] }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ port, host: '127.0.0.1' }, () => {
      const wsKey = randomBytes(16).toString('base64');
      socket.write(
        `GET / HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${wsKey}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`
      );
    });

    const messages: string[] = [];
    let upgraded = false;
    let dataBuf = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      dataBuf = Buffer.concat([dataBuf, chunk]);

      if (!upgraded) {
        const headerEnd = dataBuf.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerStr = dataBuf.subarray(0, headerEnd).toString('utf-8');
        if (!headerStr.includes('101')) {
          reject(new Error(`Upgrade failed: ${headerStr}`));
          return;
        }
        upgraded = true;
        dataBuf = dataBuf.subarray(headerEnd + 4);
        resolve({ socket, messages });
      }

      // Parse frames from remaining buffer
      while (dataBuf.length >= 2) {
        const frameLen = dataBuf[1] & 0x7f;
        let headerLen = 2;
        let actualLen = frameLen;
        if (frameLen === 126) {
          if (dataBuf.length < 4) break;
          actualLen = dataBuf.readUInt16BE(2);
          headerLen = 4;
        } else if (frameLen === 127) {
          if (dataBuf.length < 10) break;
          actualLen = Number(dataBuf.readBigUInt64BE(2));
          headerLen = 10;
        }
        const totalLen = headerLen + actualLen;
        if (dataBuf.length < totalLen) break;

        const msg = decodeServerFrame(dataBuf.subarray(0, totalLen));
        if (msg !== null) messages.push(msg);
        dataBuf = dataBuf.subarray(totalLen);
      }
    });

    socket.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

/** Wait for messages to accumulate. */
function waitForMessages(messages: string[], count: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (messages.length >= count) { resolve(); return; }
      setTimeout(check, 20);
    };
    check();
    setTimeout(() => reject(new Error(`Timeout waiting for ${count} messages, got ${messages.length}`)), timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMessagingServer', () => {
  let server: MessagingServer;
  const openSockets: import('node:net').Socket[] = [];

  afterEach(async () => {
    for (const s of openSockets) {
      try { s.destroy(); } catch { /* ignore */ }
    }
    openSockets.length = 0;
    if (server) {
      await server.stop();
    }
  });

  function setupServer() {
    const providerKeys = makeKeys();
    const patientKeys = makeKeys();
    const vault = createMockVault();
    const knownProviders = new Map<string, KnownProvider>([
      [PROVIDER_NPI, {
        npi: PROVIDER_NPI,
        provider_name: PROVIDER_NAME,
        public_key: providerKeys.pubB64,
        trust_level: 'active',
      }],
    ]);

    const consentEngine = createConsentEngine({
      posture: 'allow-trusted',
      trustList: [{ npi: PROVIDER_NPI, trust_level: 'active', provider_name: PROVIDER_NAME }],
    });

    const pipeline = createMessagePipeline({
      consentEngine,
      chartVault: vault as any,
      knownProviders,
      patientPrivateKey: patientKeys.privateKey,
      patientAgentId: PATIENT_AGENT_ID,
    });

    server = createMessagingServer(
      { port: 0, patientAgentId: PATIENT_AGENT_ID },
      { pipeline, knownProviders, patientAgentId: PATIENT_AGENT_ID },
    );

    return { providerKeys, patientKeys, vault, knownProviders, consentEngine, pipeline };
  }

  // -----------------------------------------------------------------------
  // Server lifecycle
  // -----------------------------------------------------------------------

  it('starts and stops without error', async () => {
    setupServer();
    await server.start();
    expect(server.port()).toBeGreaterThan(0);
    expect(server.connectionCount()).toBe(0);
    await server.stop();
  });

  it('accepts WebSocket upgrade connections', async () => {
    setupServer();
    await server.start();

    const { socket } = await wsConnect(server.port());
    openSockets.push(socket);

    expect(server.connectionCount()).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Connection Authentication
  // -----------------------------------------------------------------------

  it('authenticates a known provider with valid auth token', async () => {
    const { providerKeys } = setupServer();
    await server.start();

    const { socket, messages } = await wsConnect(server.port());
    openSockets.push(socket);

    const tokenPayload: Record<string, unknown> = {
      type: 'connection_auth',
      provider_npi: PROVIDER_NPI,
      provider_entity_id: 'entity-001',
      timestamp: new Date().toISOString(),
      patient_agent_id: PATIENT_AGENT_ID,
    };
    const sig = providerSignObj(tokenPayload, providerKeys.privB64);
    const token = { ...tokenPayload, signature: sig, sender_public_key: providerKeys.pubB64 };

    socket.write(buildWsFrame(JSON.stringify(token)));
    await waitForMessages(messages, 1);

    const response = JSON.parse(messages[0]);
    expect(response.type).toBe('connection_auth_ack');
    expect(response.status).toBe('authenticated');
  });

  it('rejects unknown provider', async () => {
    setupServer();
    await server.start();

    const unknownKeys = makeKeys();
    const { socket, messages } = await wsConnect(server.port());
    openSockets.push(socket);

    const tokenPayload: Record<string, unknown> = {
      type: 'connection_auth',
      provider_npi: '9999999999',
      provider_entity_id: 'entity-bad',
      timestamp: new Date().toISOString(),
      patient_agent_id: PATIENT_AGENT_ID,
    };
    const sig = providerSignObj(tokenPayload, unknownKeys.privB64);
    const token = { ...tokenPayload, signature: sig, sender_public_key: unknownKeys.pubB64 };

    socket.write(buildWsFrame(JSON.stringify(token)));
    await waitForMessages(messages, 1);

    const response = JSON.parse(messages[0]);
    expect(response.type).toBe('error');
    expect(response.error).toContain('Unknown or untrusted');
  });

  it('rejects invalid auth token signature', async () => {
    const { providerKeys } = setupServer();
    await server.start();

    const { socket, messages } = await wsConnect(server.port());
    openSockets.push(socket);

    const token = {
      type: 'connection_auth',
      provider_npi: PROVIDER_NPI,
      provider_entity_id: 'entity-001',
      timestamp: new Date().toISOString(),
      patient_agent_id: PATIENT_AGENT_ID,
      signature: 'invalid-signature-data',
      sender_public_key: providerKeys.pubB64,
    };

    socket.write(buildWsFrame(JSON.stringify(token)));
    await waitForMessages(messages, 1);

    const response = JSON.parse(messages[0]);
    expect(response.type).toBe('error');
    expect(response.error).toContain('Invalid auth signature');
  });

  it('rejects expired auth token', async () => {
    const { providerKeys } = setupServer();
    await server.start();

    const { socket, messages } = await wsConnect(server.port());
    openSockets.push(socket);

    const tokenPayload: Record<string, unknown> = {
      type: 'connection_auth',
      provider_npi: PROVIDER_NPI,
      provider_entity_id: 'entity-001',
      timestamp: '2020-01-01T00:00:00Z', // old timestamp
      patient_agent_id: PATIENT_AGENT_ID,
    };
    const sig = providerSignObj(tokenPayload, providerKeys.privB64);
    const token = { ...tokenPayload, signature: sig, sender_public_key: providerKeys.pubB64 };

    socket.write(buildWsFrame(JSON.stringify(token)));
    await waitForMessages(messages, 1);

    const response = JSON.parse(messages[0]);
    expect(response.type).toBe('error');
    expect(response.error).toContain('expired');
  });

  it('rejects token addressed to wrong patient', async () => {
    const { providerKeys } = setupServer();
    await server.start();

    const { socket, messages } = await wsConnect(server.port());
    openSockets.push(socket);

    const tokenPayload: Record<string, unknown> = {
      type: 'connection_auth',
      provider_npi: PROVIDER_NPI,
      provider_entity_id: 'entity-001',
      timestamp: new Date().toISOString(),
      patient_agent_id: 'wrong-patient-id',
    };
    const sig = providerSignObj(tokenPayload, providerKeys.privB64);
    const token = { ...tokenPayload, signature: sig, sender_public_key: providerKeys.pubB64 };

    socket.write(buildWsFrame(JSON.stringify(token)));
    await waitForMessages(messages, 1);

    const response = JSON.parse(messages[0]);
    expect(response.type).toBe('error');
    expect(response.error).toContain('Wrong patient');
  });

  // -----------------------------------------------------------------------
  // Message processing after auth
  // -----------------------------------------------------------------------

  it('processes clinical messages after successful auth', async () => {
    const { providerKeys } = setupServer();
    await server.start();

    const { socket, messages } = await wsConnect(server.port());
    openSockets.push(socket);

    // Auth first
    const tokenPayload: Record<string, unknown> = {
      type: 'connection_auth',
      provider_npi: PROVIDER_NPI,
      provider_entity_id: 'entity-001',
      timestamp: new Date().toISOString(),
      patient_agent_id: PATIENT_AGENT_ID,
    };
    const authSig = providerSignObj(tokenPayload, providerKeys.privB64);
    const token = { ...tokenPayload, signature: authSig, sender_public_key: providerKeys.pubB64 };
    socket.write(buildWsFrame(JSON.stringify(token)));
    await waitForMessages(messages, 1);

    expect(JSON.parse(messages[0]).status).toBe('authenticated');

    // Send a clinical message
    const payload = {
      type: 'clinical_summary' as const,
      summary: 'Patient visit summary',
      provider_npi: PROVIDER_NPI,
      provider_name: PROVIDER_NAME,
    };
    const msgSig = providerSignObj(payload, providerKeys.privB64);
    const envelope = {
      version: '1',
      message_id: 'msg-ws-001',
      correlation_id: 'corr-ws-001',
      timestamp: new Date().toISOString(),
      sender_public_key: providerKeys.pubB64,
      patient_agent_id: PATIENT_AGENT_ID,
      payload,
      signature: msgSig,
    };

    socket.write(buildWsFrame(JSON.stringify(envelope)));
    await waitForMessages(messages, 2);

    const ack = JSON.parse(messages[1]);
    expect(ack.type).toBe('message_ack');
    expect(ack.status).toBe('accepted');
    expect(ack.correlation_id).toBe('corr-ws-001');
  });

  // -----------------------------------------------------------------------
  // Reconnection
  // -----------------------------------------------------------------------

  it('accepts reconnections from the same provider', async () => {
    const { providerKeys } = setupServer();
    await server.start();

    // First connection
    const conn1 = await wsConnect(server.port());
    openSockets.push(conn1.socket);

    const tokenPayload: Record<string, unknown> = {
      type: 'connection_auth',
      provider_npi: PROVIDER_NPI,
      provider_entity_id: 'entity-001',
      timestamp: new Date().toISOString(),
      patient_agent_id: PATIENT_AGENT_ID,
    };
    const sig1 = providerSignObj(tokenPayload, providerKeys.privB64);
    conn1.socket.write(buildWsFrame(JSON.stringify({
      ...tokenPayload, signature: sig1, sender_public_key: providerKeys.pubB64,
    })));
    await waitForMessages(conn1.messages, 1);
    expect(JSON.parse(conn1.messages[0]).status).toBe('authenticated');

    // Disconnect
    conn1.socket.destroy();
    await new Promise(r => setTimeout(r, 100));

    // Reconnect
    const conn2 = await wsConnect(server.port());
    openSockets.push(conn2.socket);

    const tokenPayload2: Record<string, unknown> = {
      type: 'connection_auth',
      provider_npi: PROVIDER_NPI,
      provider_entity_id: 'entity-001',
      timestamp: new Date().toISOString(),
      patient_agent_id: PATIENT_AGENT_ID,
    };
    const sig2 = providerSignObj(tokenPayload2, providerKeys.privB64);
    conn2.socket.write(buildWsFrame(JSON.stringify({
      ...tokenPayload2, signature: sig2, sender_public_key: providerKeys.pubB64,
    })));
    await waitForMessages(conn2.messages, 1);
    expect(JSON.parse(conn2.messages[0]).status).toBe('authenticated');
  });

  // -----------------------------------------------------------------------
  // Public key mismatch
  // -----------------------------------------------------------------------

  it('rejects connection with mismatched public key', async () => {
    const { providerKeys } = setupServer();
    await server.start();

    const otherKeys = makeKeys();

    const { socket, messages } = await wsConnect(server.port());
    openSockets.push(socket);

    const tokenPayload: Record<string, unknown> = {
      type: 'connection_auth',
      provider_npi: PROVIDER_NPI,
      provider_entity_id: 'entity-001',
      timestamp: new Date().toISOString(),
      patient_agent_id: PATIENT_AGENT_ID,
    };
    // Sign with provider's key but send other key as public
    const sig = providerSignObj(tokenPayload, providerKeys.privB64);
    const token = { ...tokenPayload, signature: sig, sender_public_key: otherKeys.pubB64 };

    socket.write(buildWsFrame(JSON.stringify(token)));
    await waitForMessages(messages, 1);

    const response = JSON.parse(messages[0]);
    expect(response.type).toBe('error');
    expect(response.error).toContain('Public key mismatch');
  });
});
