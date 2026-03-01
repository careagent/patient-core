/**
 * Tests for the message processing pipeline — the full verification,
 * consent, encryption, and storage flow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createMessagePipeline, type MessagePipelineConfig } from '../../../src/messaging/pipeline.js';
import { createConsentEngine } from '../../../src/consent/engine.js';
import type { PatientChartVault, ChartOperationResult } from '../../../src/chart/types.js';
import type { KnownProvider, SignedMessageEnvelope } from '../../../src/messaging/schemas.js';
import { generateEncryptionKey, decryptPayload } from '../../../src/messaging/crypto.js';
import { publicKeyToBase64Url } from '../../../src/discovery/crypto.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const PATIENT_AGENT_ID = 'patient-agent-test-001';
const PROVIDER_NPI = '1234567890';
const PROVIDER_NAME = 'Dr. Test Smith';

function makeProviderKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubB64 = publicKeyToBase64Url(publicKey);
  const jwk = privateKey.export({ format: 'jwk' }) as { d: string };
  return { publicKey, privateKey, pubB64, privB64: jwk.d };
}

function providerSignPayload(payload: Record<string, unknown>, privB64Url: string): string {
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

function makeValidEnvelope(providerKeys: ReturnType<typeof makeProviderKeys>): SignedMessageEnvelope {
  const payload = {
    type: 'clinical_summary' as const,
    summary: 'Patient visit summary - doing well',
    provider_npi: PROVIDER_NPI,
    provider_name: PROVIDER_NAME,
  };

  const signature = providerSignPayload(payload, providerKeys.privB64);

  return {
    version: '1',
    message_id: '550e8400-e29b-41d4-a716-446655440000',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    timestamp: new Date().toISOString(),
    sender_public_key: providerKeys.pubB64,
    patient_agent_id: PATIENT_AGENT_ID,
    payload,
    signature,
  };
}

function createMockVault(): PatientChartVault & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    entries,
    async read(recordId: string) {
      return entries.get(recordId) ?? null;
    },
    async write(recordId: string, data: unknown): Promise<ChartOperationResult> {
      entries.set(recordId, data);
      return { success: true };
    },
    async checkAccess(_recordId: string) {
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Pipeline Tests
// ---------------------------------------------------------------------------

describe('createMessagePipeline', () => {
  let providerKeys: ReturnType<typeof makeProviderKeys>;
  let patientKeys: ReturnType<typeof makeProviderKeys>;
  let encryptionKey: Buffer;
  let knownProviders: Map<string, KnownProvider>;
  let vault: ReturnType<typeof createMockVault>;

  beforeEach(() => {
    providerKeys = makeProviderKeys();
    patientKeys = makeProviderKeys();
    encryptionKey = generateEncryptionKey();
    vault = createMockVault();
    knownProviders = new Map([
      [PROVIDER_NPI, {
        npi: PROVIDER_NPI,
        provider_name: PROVIDER_NAME,
        public_key: providerKeys.pubB64,
        trust_level: 'active',
        connection_id: 'conn-001',
      }],
    ]);
  });

  function makePipeline(posture: 'deny-all' | 'allow-trusted' | 'custom' = 'allow-trusted') {
    const consentEngine = createConsentEngine({
      posture,
      trustList: posture === 'allow-trusted' ? [
        { npi: PROVIDER_NPI, trust_level: 'active', provider_name: PROVIDER_NAME },
      ] : undefined,
    });

    const config: MessagePipelineConfig = {
      consentEngine,
      chartVault: vault,
      knownProviders,
      encryptionKey,
      patientPrivateKey: patientKeys.privateKey,
      patientAgentId: PATIENT_AGENT_ID,
    };

    return { pipeline: createMessagePipeline(config), consentEngine };
  }

  // -------------------------------------------------------------------------
  // Full happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('accepts a valid message from an active trusted provider', async () => {
      const { pipeline } = makePipeline('allow-trusted');
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('accepted');
      expect(result.ack.correlation_id).toBe(envelope.correlation_id);
      expect(result.ack.type).toBe('message_ack');
      expect(result.ack.timestamp).toBeDefined();
      expect(result.ack.signature).toBeDefined();
      expect(result.ledgerEntry).toBeDefined();
    });

    it('stores the message in the chart vault', async () => {
      const { pipeline } = makePipeline('allow-trusted');
      const envelope = makeValidEnvelope(providerKeys);
      await pipeline.processMessage(JSON.stringify(envelope));

      expect(vault.entries.size).toBe(1);
      const key = `ledger:message:${PROVIDER_NPI}:${envelope.correlation_id}`;
      const stored = vault.entries.get(key) as Record<string, unknown>;
      expect(stored).toBeDefined();
      expect(stored.type).toBe('clinical_message_received');
      expect(stored.correlation_id).toBe(envelope.correlation_id);
    });

    it('encrypts the payload at rest', async () => {
      const { pipeline } = makePipeline('allow-trusted');
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ledgerEntry).toBeDefined();
      const entry = result.ledgerEntry!;
      expect(entry.encrypted_payload.ciphertext).toBeDefined();
      expect(entry.encrypted_payload.iv).toBeDefined();
      expect(entry.encrypted_payload.auth_tag).toBeDefined();

      // Verify we can decrypt to get the original payload
      const decrypted = decryptPayload(entry.encrypted_payload, encryptionKey);
      const parsed = JSON.parse(decrypted);
      expect(parsed.type).toBe('clinical_summary');
      expect(parsed.summary).toBe(envelope.payload.summary);
    });

    it('includes bilateral correlation ID in ledger entry', async () => {
      const { pipeline } = makePipeline('allow-trusted');
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ledgerEntry!.correlation_id).toBe(envelope.correlation_id);
      expect(result.ack.correlation_id).toBe(envelope.correlation_id);
    });

    it('signs the ack message with patient private key', async () => {
      const { pipeline } = makePipeline('allow-trusted');
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.signature).toBeDefined();
      expect(typeof result.ack.signature).toBe('string');
      expect(result.ack.signature!.length).toBe(86); // 64 bytes -> 86 base64url
    });
  });

  // -------------------------------------------------------------------------
  // Schema validation failures
  // -------------------------------------------------------------------------

  describe('schema validation', () => {
    it('rejects invalid JSON', async () => {
      const { pipeline } = makePipeline();
      const result = await pipeline.processMessage('not-json{{{');

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('schema_validation_failed');
    });

    it('rejects message with missing required fields', async () => {
      const { pipeline } = makePipeline();
      const result = await pipeline.processMessage(JSON.stringify({
        version: '1',
        message_id: 'some-id',
        // missing other required fields
      }));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('schema_validation_failed');
    });

    it('rejects message with wrong version', async () => {
      const { pipeline } = makePipeline();
      const envelope = makeValidEnvelope(providerKeys);
      (envelope as unknown as Record<string, unknown>).version = '2';
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('schema_validation_failed');
    });

    it('rejects message addressed to wrong patient agent', async () => {
      const { pipeline } = makePipeline();
      const envelope = makeValidEnvelope(providerKeys);
      envelope.patient_agent_id = 'wrong-patient';
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('schema_validation_failed');
    });
  });

  // -------------------------------------------------------------------------
  // Signature verification failures
  // -------------------------------------------------------------------------

  describe('signature verification', () => {
    it('rejects message with invalid signature', async () => {
      const { pipeline } = makePipeline();
      const envelope = makeValidEnvelope(providerKeys);
      envelope.signature = 'invalid-signature-base64url-encoded-garbage-data-that-is-not-real';
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('invalid_signature');
    });

    it('rejects message signed with wrong key', async () => {
      const { pipeline } = makePipeline();
      const wrongKeys = makeProviderKeys();
      const envelope = makeValidEnvelope(providerKeys);
      // Re-sign with a different key
      envelope.signature = providerSignPayload(
        envelope.payload as unknown as Record<string, unknown>,
        wrongKeys.privB64,
      );
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('invalid_signature');
    });

    it('rejects message with tampered payload', async () => {
      const { pipeline } = makePipeline();
      const envelope = makeValidEnvelope(providerKeys);
      // Tamper with the payload after signing
      (envelope.payload as unknown as Record<string, unknown>).summary = 'Tampered content';
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('invalid_signature');
    });
  });

  // -------------------------------------------------------------------------
  // Sender verification
  // -------------------------------------------------------------------------

  describe('sender verification', () => {
    it('rejects message from unknown provider NPI', async () => {
      const { pipeline } = makePipeline();
      const unknownKeys = makeProviderKeys();
      const payload = {
        type: 'clinical_summary' as const,
        summary: 'Test',
        provider_npi: '9999999999',
        provider_name: 'Unknown Provider',
      };
      const sig = providerSignPayload(payload, unknownKeys.privB64);
      const envelope: SignedMessageEnvelope = {
        version: '1',
        message_id: 'msg-001',
        correlation_id: 'corr-001',
        timestamp: new Date().toISOString(),
        sender_public_key: unknownKeys.pubB64,
        patient_agent_id: PATIENT_AGENT_ID,
        payload,
        signature: sig,
      };

      const result = await pipeline.processMessage(JSON.stringify(envelope));
      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('unknown_sender');
    });

    it('rejects message from suspended provider', async () => {
      knownProviders.set(PROVIDER_NPI, {
        ...knownProviders.get(PROVIDER_NPI)!,
        trust_level: 'suspended',
      });
      const { pipeline } = makePipeline();
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('unknown_sender');
    });

    it('rejects message from revoked provider', async () => {
      knownProviders.set(PROVIDER_NPI, {
        ...knownProviders.get(PROVIDER_NPI)!,
        trust_level: 'revoked',
      });
      const { pipeline } = makePipeline();
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('unknown_sender');
    });

    it('rejects message from pending provider', async () => {
      knownProviders.set(PROVIDER_NPI, {
        ...knownProviders.get(PROVIDER_NPI)!,
        trust_level: 'pending',
      });
      const { pipeline } = makePipeline();
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('unknown_sender');
    });

    it('rejects message with mismatched public key', async () => {
      // Provider known with different public key than the one in the envelope
      const otherKeys = makeProviderKeys();
      knownProviders.set(PROVIDER_NPI, {
        ...knownProviders.get(PROVIDER_NPI)!,
        public_key: otherKeys.pubB64,
      });
      const { pipeline } = makePipeline();
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('unknown_sender');
    });
  });

  // -------------------------------------------------------------------------
  // Consent checks
  // -------------------------------------------------------------------------

  describe('consent gate', () => {
    it('rejects message when deny-all posture with no consent record', async () => {
      const { pipeline } = makePipeline('deny-all');
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('consent_required');
    });

    it('accepts message with deny-all posture when explicit consent exists', async () => {
      const { pipeline, consentEngine } = makePipeline('deny-all');
      consentEngine.record({
        action: 'message:receive',
        actorId: PROVIDER_NPI,
        decision: 'allow',
      });
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('accepted');
    });

    it('accepts message with allow-trusted posture for active provider', async () => {
      const { pipeline } = makePipeline('allow-trusted');
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('accepted');
    });

    it('rejects when consent is explicitly denied', async () => {
      const { pipeline, consentEngine } = makePipeline('allow-trusted');
      consentEngine.record({
        action: 'message:receive',
        actorId: PROVIDER_NPI,
        decision: 'deny',
      });
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('consent_required');
    });

    it('rejects when consent is revoked', async () => {
      const { pipeline, consentEngine } = makePipeline('deny-all');
      const record = consentEngine.record({
        action: 'message:receive',
        actorId: PROVIDER_NPI,
        decision: 'allow',
      });
      consentEngine.revoke(record.id);
      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('consent_required');
    });
  });

  // -------------------------------------------------------------------------
  // Storage failures
  // -------------------------------------------------------------------------

  describe('storage', () => {
    it('rejects message when vault write fails', async () => {
      const failingVault: PatientChartVault = {
        async read() { return null; },
        async write(): Promise<ChartOperationResult> { return { success: false, error: 'disk full' }; },
        async checkAccess() { return true; },
      };

      const consentEngine = createConsentEngine({
        posture: 'allow-trusted',
        trustList: [{ npi: PROVIDER_NPI, trust_level: 'active', provider_name: PROVIDER_NAME }],
      });

      const pipeline = createMessagePipeline({
        consentEngine,
        chartVault: failingVault,
        knownProviders,
        encryptionKey,
        patientAgentId: PATIENT_AGENT_ID,
      });

      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('storage_error');
    });

    it('rejects message when vault throws', async () => {
      const throwingVault: PatientChartVault = {
        async read() { return null; },
        async write(): Promise<ChartOperationResult> { throw new Error('connection lost'); },
        async checkAccess() { return true; },
      };

      const consentEngine = createConsentEngine({
        posture: 'allow-trusted',
        trustList: [{ npi: PROVIDER_NPI, trust_level: 'active', provider_name: PROVIDER_NAME }],
      });

      const pipeline = createMessagePipeline({
        consentEngine,
        chartVault: throwingVault,
        knownProviders,
        encryptionKey,
        patientAgentId: PATIENT_AGENT_ID,
      });

      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));

      expect(result.ack.status).toBe('rejected');
      expect(result.ack.reason).toBe('storage_error');
    });
  });

  // -------------------------------------------------------------------------
  // Multiple message types
  // -------------------------------------------------------------------------

  describe('message types', () => {
    it('accepts appointment_reminder messages', async () => {
      const { pipeline } = makePipeline('allow-trusted');
      const payload = {
        type: 'appointment_reminder' as const,
        scheduled_at: '2026-03-15T10:00:00Z',
        provider_npi: PROVIDER_NPI,
        provider_name: PROVIDER_NAME,
        reason: 'Follow-up visit',
      };
      const sig = providerSignPayload(payload, providerKeys.privB64);
      const envelope: SignedMessageEnvelope = {
        version: '1',
        message_id: 'msg-apt-001',
        correlation_id: 'corr-apt-001',
        timestamp: new Date().toISOString(),
        sender_public_key: providerKeys.pubB64,
        patient_agent_id: PATIENT_AGENT_ID,
        payload,
        signature: sig,
      };

      const result = await pipeline.processMessage(JSON.stringify(envelope));
      expect(result.ack.status).toBe('accepted');
      expect(result.ledgerEntry!.message_type).toBe('appointment_reminder');
    });

    it('accepts care_plan_update messages', async () => {
      const { pipeline } = makePipeline('allow-trusted');
      const payload = {
        type: 'care_plan_update' as const,
        summary: 'Updated diabetes management plan',
        provider_npi: PROVIDER_NPI,
        provider_name: PROVIDER_NAME,
      };
      const sig = providerSignPayload(payload, providerKeys.privB64);
      const envelope: SignedMessageEnvelope = {
        version: '1',
        message_id: 'msg-cp-001',
        correlation_id: 'corr-cp-001',
        timestamp: new Date().toISOString(),
        sender_public_key: providerKeys.pubB64,
        patient_agent_id: PATIENT_AGENT_ID,
        payload,
        signature: sig,
      };

      const result = await pipeline.processMessage(JSON.stringify(envelope));
      expect(result.ack.status).toBe('accepted');
      expect(result.ledgerEntry!.message_type).toBe('care_plan_update');
    });
  });

  // -------------------------------------------------------------------------
  // Pipeline without patient private key (no ack signing)
  // -------------------------------------------------------------------------

  describe('without patient private key', () => {
    it('produces acks without signatures', async () => {
      const consentEngine = createConsentEngine({
        posture: 'allow-trusted',
        trustList: [{ npi: PROVIDER_NPI, trust_level: 'active', provider_name: PROVIDER_NAME }],
      });

      const pipeline = createMessagePipeline({
        consentEngine,
        chartVault: vault,
        knownProviders,
        encryptionKey,
        patientAgentId: PATIENT_AGENT_ID,
        // no patientPrivateKey
      });

      const envelope = makeValidEnvelope(providerKeys);
      const result = await pipeline.processMessage(JSON.stringify(envelope));
      expect(result.ack.status).toBe('accepted');
      expect(result.ack.signature).toBeUndefined();
    });
  });
});
