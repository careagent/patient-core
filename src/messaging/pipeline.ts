/**
 * Message processing pipeline — the core logic for receiving and processing
 * incoming clinical messages from provider agents.
 *
 * Pipeline steps:
 * 1. Parse and validate against TypeBox schema
 * 2. Verify Ed25519 signature (provider-core convention: shallow sorted keys)
 * 3. Verify sender is a known, active provider
 * 4. Check consent engine (Layer 5) for message:receive
 * 5. Encrypt message payload with AES-256-GCM
 * 6. Write encrypted message to chart vault as ledger entry
 * 7. Return accepted/rejected result
 *
 * Each step can short-circuit with a rejection reason.
 */

import { randomUUID } from 'node:crypto';
import {
  SignedMessageEnvelopeValidator,
  type SignedMessageEnvelope,
  type MessageAck,
  type MessageLedgerEntry,
  type KnownProvider,
} from './schemas.js';
import {
  verifyMessageSignature,
  encryptPayload,
  signAck,
} from './crypto.js';
import type { ConsentEngine } from '../consent/engine.js';
import type { PatientChartVault } from '../chart/types.js';
import type { KeyObject } from 'node:crypto';

// ---------------------------------------------------------------------------
// Pipeline Configuration
// ---------------------------------------------------------------------------

export interface MessagePipelineConfig {
  /** The consent engine instance (Layer 5). */
  consentEngine: ConsentEngine;
  /** The patient chart vault for storing messages. */
  chartVault: PatientChartVault;
  /** Map of known providers by NPI (from handshake records). */
  knownProviders: Map<string, KnownProvider>;
  /** AES-256 encryption key for at-rest storage. */
  encryptionKey: Buffer;
  /** Patient's Ed25519 private key for signing acks. */
  patientPrivateKey?: KeyObject;
  /** Patient agent ID. */
  patientAgentId: string;
}

// ---------------------------------------------------------------------------
// Pipeline Result
// ---------------------------------------------------------------------------

export interface PipelineResult {
  /** The message ack to send back to the provider. */
  ack: MessageAck;
  /** The ledger entry written to the chart vault (if accepted). */
  ledgerEntry?: MessageLedgerEntry;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Create a message processing pipeline.
 *
 * Returns a function that processes a raw WebSocket message string
 * through the full verification -> consent -> encrypt -> store pipeline.
 */
export function createMessagePipeline(config: MessagePipelineConfig) {
  const {
    consentEngine,
    chartVault,
    knownProviders,
    encryptionKey,
    patientPrivateKey,
    patientAgentId,
  } = config;

  /**
   * Process a raw incoming message.
   *
   * @param rawMessage - The raw JSON string from the WebSocket
   * @returns Pipeline result with ack and optional ledger entry
   */
  async function processMessage(rawMessage: string): Promise<PipelineResult> {
    // Step 1: Parse and validate schema
    let envelope: SignedMessageEnvelope;
    try {
      const parsed = JSON.parse(rawMessage);
      if (!SignedMessageEnvelopeValidator.Check(parsed)) {
        return makeNack('schema_validation_failed', '');
      }
      envelope = parsed;
    } catch {
      return makeNack('schema_validation_failed', '');
    }

    const correlationId = envelope.correlation_id;

    // Verify this message is addressed to us
    if (envelope.patient_agent_id !== patientAgentId) {
      return makeNack('schema_validation_failed', correlationId);
    }

    // Step 2: Verify Ed25519 signature
    const signatureValid = verifyMessageSignature(
      envelope.payload as unknown as Record<string, unknown>,
      envelope.signature,
      envelope.sender_public_key,
    );

    if (!signatureValid) {
      return makeNack('invalid_signature', correlationId);
    }

    // Step 3: Verify sender is a known, active provider
    const senderNpi = envelope.payload.provider_npi;
    const knownProvider = knownProviders.get(senderNpi);

    if (!knownProvider) {
      return makeNack('unknown_sender', correlationId);
    }

    if (knownProvider.trust_level !== 'active') {
      return makeNack('unknown_sender', correlationId);
    }

    // Verify the public key matches the known provider
    if (knownProvider.public_key !== envelope.sender_public_key) {
      return makeNack('unknown_sender', correlationId);
    }

    // Step 4: Check consent engine (Layer 5)
    const consentDecision = consentEngine.check({
      action: 'message:receive',
      actorId: senderNpi,
    });

    if (!consentDecision.allowed) {
      return makeNack('consent_required', correlationId);
    }

    // Step 5: Encrypt message payload with AES-256-GCM
    const payloadJson = JSON.stringify(envelope.payload);
    const encryptedPayload = encryptPayload(payloadJson, encryptionKey);

    // Step 6: Build ledger entry and write to chart vault
    const ledgerEntry: MessageLedgerEntry = {
      type: 'clinical_message_received',
      correlation_id: correlationId,
      sender_npi: senderNpi,
      sender_name: envelope.payload.provider_name,
      message_type: envelope.payload.type,
      received_at: new Date().toISOString(),
      sent_at: envelope.timestamp,
      encrypted_payload: encryptedPayload,
      signature_verified: true,
      consent_granted: true,
    };

    const vaultKey = `ledger:message:${senderNpi}:${correlationId}`;
    try {
      const result = await chartVault.write(vaultKey, ledgerEntry);
      if (!result.success) {
        return makeNack('storage_error', correlationId);
      }
    } catch {
      return makeNack('storage_error', correlationId);
    }

    // Step 7: Return accepted ack
    const ack = makeAckMessage('accepted', correlationId);
    return { ack, ledgerEntry };
  }

  function makeNack(reason: MessageAck['reason'], correlationId: string): PipelineResult {
    const ack = makeAckMessage('rejected', correlationId, reason);
    return { ack };
  }

  function makeAckMessage(
    status: MessageAck['status'],
    correlationId: string,
    reason?: MessageAck['reason'],
  ): MessageAck {
    const ack: MessageAck = {
      type: 'message_ack',
      correlation_id: correlationId || randomUUID(),
      status,
      timestamp: new Date().toISOString(),
    };

    if (reason) {
      ack.reason = reason;
    }

    if (patientPrivateKey) {
      const ackPayload = JSON.stringify({
        type: ack.type,
        correlation_id: ack.correlation_id,
        status: ack.status,
        reason: ack.reason,
        timestamp: ack.timestamp,
      });
      ack.signature = signAck(ackPayload, patientPrivateKey);
    }

    return ack;
  }

  return { processMessage };
}
