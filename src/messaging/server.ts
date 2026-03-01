/**
 * WebSocket messaging server — receives incoming clinical messages from
 * provider agents.
 *
 * Uses Node.js built-in http module with manual WebSocket upgrade.
 * Connection authentication: providers must present a signed auth token
 * in the first message after connecting.
 *
 * Reconnection handling: the server accepts new connections from providers
 * that previously connected. Connection state is tracked per-provider.
 */

import { createServer, type Server, type IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import {
  ConnectionAuthTokenValidator,
  type ConnectionAuthToken,
  type KnownProvider,
  type MessagingServerConfig,
} from './schemas.js';
import { verifyMessageSignature } from './crypto.js';
import type { createMessagePipeline } from './pipeline.js';

// ---------------------------------------------------------------------------
// WebSocket frame helpers (RFC 6455 minimal implementation)
// ---------------------------------------------------------------------------

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0BE11CF5';

function computeAcceptKey(clientKey: string): string {
  return createHash('sha1')
    .update(clientKey + WEBSOCKET_GUID)
    .digest('base64');
}

function encodeFrame(data: string): Buffer {
  const payload = Buffer.from(data, 'utf-8');
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

function decodeFrame(buffer: Buffer): { opcode: number; payload: Buffer; bytesConsumed: number } | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const opcode = firstByte & 0x0f;
  const secondByte = buffer[1];
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  const maskSize = masked ? 4 : 0;
  const totalNeeded = offset + maskSize + payloadLength;
  if (buffer.length < totalNeeded) return null;

  let payload: Buffer;
  if (masked) {
    const maskKey = buffer.subarray(offset, offset + 4);
    offset += 4;
    payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      payload[i] = buffer[offset + i] ^ maskKey[i % 4];
    }
  } else {
    payload = buffer.subarray(offset, offset + payloadLength);
  }

  return { opcode, payload, bytesConsumed: totalNeeded };
}

// ---------------------------------------------------------------------------
// Connection State
// ---------------------------------------------------------------------------

interface ConnectionState {
  authenticated: boolean;
  providerNpi?: string;
  providerEntityId?: string;
  connectedAt: string;
}

// ---------------------------------------------------------------------------
// Messaging Server
// ---------------------------------------------------------------------------

export interface MessagingServer {
  /** Start listening for incoming WebSocket connections. */
  start(): Promise<void>;
  /** Stop the server and close all connections. */
  stop(): Promise<void>;
  /** Get the actual port the server is listening on. */
  port(): number;
  /** Get the number of active connections. */
  connectionCount(): number;
}

export interface MessagingServerDeps {
  /** The message processing pipeline. */
  pipeline: ReturnType<typeof createMessagePipeline>;
  /** Map of known providers by NPI. */
  knownProviders: Map<string, KnownProvider>;
  /** Patient agent ID for connection auth validation. */
  patientAgentId: string;
}

/**
 * Create a WebSocket messaging server for receiving provider messages.
 *
 * Connection lifecycle:
 * 1. Provider connects via HTTP upgrade
 * 2. First message must be a ConnectionAuthToken
 * 3. Server verifies auth token signature and provider identity
 * 4. Subsequent messages are clinical messages processed through the pipeline
 * 5. Server sends ack/nack for each message
 */
export function createMessagingServer(
  config: MessagingServerConfig,
  deps: MessagingServerDeps,
): MessagingServer {
  const { pipeline, knownProviders, patientAgentId } = deps;
  const connections = new Map<string, { socket: Socket; state: ConnectionState }>();
  let server: Server;
  let actualPort = 0;

  function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      server = createServer((_req, res) => {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('Upgrade Required');
      });

      server.on('upgrade', (req: IncomingMessage, socket: Socket, _head) => {
        const wsKey = req.headers['sec-websocket-key'];
        if (!wsKey) {
          socket.destroy();
          return;
        }

        const acceptKey = computeAcceptKey(wsKey);
        const responseHeaders = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${acceptKey}`,
          '',
          '',
        ].join('\r\n');

        socket.write(responseHeaders);

        const connId = randomBytes(8).toString('hex');
        const state: ConnectionState = {
          authenticated: false,
          connectedAt: new Date().toISOString(),
        };
        connections.set(connId, { socket, state });

        let frameBuffer = Buffer.alloc(0);

        socket.on('data', (chunk: Buffer) => {
          frameBuffer = Buffer.concat([frameBuffer, chunk]);

          // Process all complete frames in the buffer
          while (frameBuffer.length > 0) {
            const frame = decodeFrame(frameBuffer);
            if (!frame) break;

            frameBuffer = frameBuffer.subarray(frame.bytesConsumed);

            // Handle close frame
            if (frame.opcode === 0x08) {
              // Send close frame back
              const closeFrame = Buffer.alloc(2);
              closeFrame[0] = 0x88; // FIN + close opcode
              closeFrame[1] = 0x00;
              socket.write(closeFrame);
              socket.end();
              connections.delete(connId);
              return;
            }

            // Handle ping -> respond with pong
            if (frame.opcode === 0x09) {
              const pongFrame = Buffer.alloc(2 + frame.payload.length);
              pongFrame[0] = 0x8a; // FIN + pong opcode
              pongFrame[1] = frame.payload.length;
              frame.payload.copy(pongFrame, 2);
              socket.write(pongFrame);
              continue;
            }

            // Only process text frames
            if (frame.opcode !== 0x01) continue;

            const message = frame.payload.toString('utf-8');
            handleMessage(connId, message).catch(() => {
              // Errors are handled inside handleMessage
            });
          }
        });

        socket.on('close', () => {
          connections.delete(connId);
        });

        socket.on('error', () => {
          connections.delete(connId);
        });
      });

      server.on('error', reject);

      server.listen(config.port, config.host ?? '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          actualPort = addr.port;
        }
        resolve();
      });
    });
  }

  async function handleMessage(connId: string, message: string): Promise<void> {
    const conn = connections.get(connId);
    if (!conn) return;

    const { socket, state } = conn;

    if (!state.authenticated) {
      // First message must be connection auth token
      await handleAuth(connId, socket, state, message);
      return;
    }

    // Authenticated — process through pipeline
    const result = await pipeline.processMessage(message);
    const ackJson = JSON.stringify(result.ack);
    socket.write(encodeFrame(ackJson));
  }

  async function handleAuth(
    connId: string,
    socket: Socket,
    state: ConnectionState,
    message: string,
  ): Promise<void> {
    let token: ConnectionAuthToken;
    try {
      const parsed = JSON.parse(message);
      if (!ConnectionAuthTokenValidator.Check(parsed)) {
        sendError(socket, 'Invalid auth token format');
        socket.end();
        connections.delete(connId);
        return;
      }
      token = parsed;
    } catch {
      sendError(socket, 'Invalid JSON');
      socket.end();
      connections.delete(connId);
      return;
    }

    // Verify the token is addressed to this patient agent
    if (token.patient_agent_id !== patientAgentId) {
      sendError(socket, 'Wrong patient agent');
      socket.end();
      connections.delete(connId);
      return;
    }

    // Verify provider is known and active
    const provider = knownProviders.get(token.provider_npi);
    if (!provider || provider.trust_level !== 'active') {
      sendError(socket, 'Unknown or untrusted provider');
      socket.end();
      connections.delete(connId);
      return;
    }

    // Verify public key matches known provider
    if (provider.public_key !== token.sender_public_key) {
      sendError(socket, 'Public key mismatch');
      socket.end();
      connections.delete(connId);
      return;
    }

    // Verify auth token signature
    const tokenPayload: Record<string, unknown> = {
      type: token.type,
      provider_npi: token.provider_npi,
      provider_entity_id: token.provider_entity_id,
      timestamp: token.timestamp,
      patient_agent_id: token.patient_agent_id,
    };

    const sigValid = verifyMessageSignature(
      tokenPayload,
      token.signature,
      token.sender_public_key,
    );

    if (!sigValid) {
      sendError(socket, 'Invalid auth signature');
      socket.end();
      connections.delete(connId);
      return;
    }

    // Check timestamp freshness (reject tokens older than 5 minutes)
    const tokenTime = new Date(token.timestamp).getTime();
    const now = Date.now();
    if (isNaN(tokenTime) || Math.abs(now - tokenTime) > 5 * 60 * 1000) {
      sendError(socket, 'Auth token expired');
      socket.end();
      connections.delete(connId);
      return;
    }

    // Authentication successful
    state.authenticated = true;
    state.providerNpi = token.provider_npi;
    state.providerEntityId = token.provider_entity_id;

    const authAck = JSON.stringify({
      type: 'connection_auth_ack',
      status: 'authenticated',
      timestamp: new Date().toISOString(),
    });
    socket.write(encodeFrame(authAck));
  }

  function sendError(socket: Socket, message: string): void {
    const errorMsg = JSON.stringify({
      type: 'error',
      error: message,
      timestamp: new Date().toISOString(),
    });
    socket.write(encodeFrame(errorMsg));
  }

  function stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all active connections
      for (const [connId, { socket }] of connections) {
        try {
          const closeFrame = Buffer.alloc(2);
          closeFrame[0] = 0x88;
          closeFrame[1] = 0x00;
          socket.write(closeFrame);
          socket.end();
        } catch {
          // ignore
        }
        connections.delete(connId);
      }

      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  function port(): number {
    return actualPort;
  }

  function connectionCount(): number {
    return connections.size;
  }

  return { start, stop, port, connectionCount };
}
