/**
 * Tests for messaging TypeBox schemas — validates message types,
 * ack/nack responses, connection auth tokens, and ledger entries.
 */

import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  SignedMessageEnvelopeSchema,
  SignedMessageEnvelopeValidator,
  MessageAckSchema,
  MessageAckValidator,
  ConnectionAuthTokenSchema,
  ConnectionAuthTokenValidator,
  KnownProviderSchema,
  EncryptedPayloadSchema,
  MessageLedgerEntrySchema,
  MessagingServerConfigSchema,
  ClinicalSummarySchema,
  AppointmentReminderSchema,
  CarePlanUpdateSchema,
  ClinicalMessageSchema,
  RejectionReasonSchema,
} from '../../../src/messaging/schemas.js';

// ---------------------------------------------------------------------------
// Clinical Message Types
// ---------------------------------------------------------------------------

describe('ClinicalSummarySchema', () => {
  it('validates a valid clinical summary', () => {
    const msg = {
      type: 'clinical_summary',
      summary: 'Patient visit summary',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalSummarySchema, msg)).toBe(true);
  });

  it('validates with optional fields', () => {
    const msg = {
      type: 'clinical_summary',
      encounter_id: 'enc-001',
      summary: 'Full summary',
      diagnoses: [{ code: 'J06.9', system: 'ICD-10', display: 'Acute URI' }],
      medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TID' }],
      follow_up: '2 weeks',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalSummarySchema, msg)).toBe(true);
  });

  it('rejects invalid NPI', () => {
    const msg = {
      type: 'clinical_summary',
      summary: 'Summary',
      provider_npi: '123',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalSummarySchema, msg)).toBe(false);
  });

  it('rejects empty summary', () => {
    const msg = {
      type: 'clinical_summary',
      summary: '',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalSummarySchema, msg)).toBe(false);
  });
});

describe('AppointmentReminderSchema', () => {
  it('validates a valid appointment reminder', () => {
    const msg = {
      type: 'appointment_reminder',
      scheduled_at: '2026-03-15T10:00:00Z',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(AppointmentReminderSchema, msg)).toBe(true);
  });

  it('validates with optional fields', () => {
    const msg = {
      type: 'appointment_reminder',
      appointment_id: 'apt-001',
      scheduled_at: '2026-03-15T10:00:00Z',
      location: 'Room 302',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
      reason: 'Follow-up',
      instructions: 'Fasting required',
    };
    expect(Value.Check(AppointmentReminderSchema, msg)).toBe(true);
  });
});

describe('CarePlanUpdateSchema', () => {
  it('validates a valid care plan update', () => {
    const msg = {
      type: 'care_plan_update',
      summary: 'Updated care plan',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(CarePlanUpdateSchema, msg)).toBe(true);
  });
});

describe('ClinicalMessageSchema', () => {
  it('validates clinical_summary type', () => {
    expect(Value.Check(ClinicalMessageSchema, {
      type: 'clinical_summary',
      summary: 'Test',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    })).toBe(true);
  });

  it('validates appointment_reminder type', () => {
    expect(Value.Check(ClinicalMessageSchema, {
      type: 'appointment_reminder',
      scheduled_at: '2026-03-15T10:00:00Z',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    })).toBe(true);
  });

  it('validates care_plan_update type', () => {
    expect(Value.Check(ClinicalMessageSchema, {
      type: 'care_plan_update',
      summary: 'Plan update',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    })).toBe(true);
  });

  it('rejects unknown message type', () => {
    expect(Value.Check(ClinicalMessageSchema, {
      type: 'unknown_type',
      summary: 'Test',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Signed Message Envelope
// ---------------------------------------------------------------------------

describe('SignedMessageEnvelopeSchema', () => {
  const validEnvelope = {
    version: '1' as const,
    message_id: '550e8400-e29b-41d4-a716-446655440000',
    correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    timestamp: '2026-02-28T12:00:00Z',
    sender_public_key: 'dGVzdC1wdWJsaWMta2V5LWJhc2U2NHVybC1lbmNvZGVk',
    patient_agent_id: 'patient-agent-001',
    payload: {
      type: 'clinical_summary' as const,
      summary: 'Visit summary',
      provider_npi: '1234567890',
      provider_name: 'Dr. Smith',
    },
    signature: 'dGVzdC1zaWduYXR1cmUtYmFzZTY0dXJsLWVuY29kZWQ',
  };

  it('validates a complete envelope', () => {
    expect(Value.Check(SignedMessageEnvelopeSchema, validEnvelope)).toBe(true);
    expect(SignedMessageEnvelopeValidator.Check(validEnvelope)).toBe(true);
  });

  it('rejects missing version', () => {
    const { version: _, ...noVersion } = validEnvelope;
    expect(SignedMessageEnvelopeValidator.Check(noVersion)).toBe(false);
  });

  it('rejects wrong version', () => {
    expect(SignedMessageEnvelopeValidator.Check({ ...validEnvelope, version: '2' })).toBe(false);
  });

  it('rejects missing signature', () => {
    const { signature: _, ...noSig } = validEnvelope;
    expect(SignedMessageEnvelopeValidator.Check(noSig)).toBe(false);
  });

  it('rejects missing correlation_id', () => {
    const { correlation_id: _, ...noCorrId } = validEnvelope;
    expect(SignedMessageEnvelopeValidator.Check(noCorrId)).toBe(false);
  });

  it('rejects missing payload', () => {
    const { payload: _, ...noPayload } = validEnvelope;
    expect(SignedMessageEnvelopeValidator.Check(noPayload)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Message Ack
// ---------------------------------------------------------------------------

describe('MessageAckSchema', () => {
  it('validates an accepted ack', () => {
    const ack = {
      type: 'message_ack',
      correlation_id: 'corr-001',
      status: 'accepted',
      timestamp: '2026-02-28T12:00:01Z',
    };
    expect(Value.Check(MessageAckSchema, ack)).toBe(true);
    expect(MessageAckValidator.Check(ack)).toBe(true);
  });

  it('validates a rejected ack with reason', () => {
    const ack = {
      type: 'message_ack',
      correlation_id: 'corr-001',
      status: 'rejected',
      reason: 'invalid_signature',
      timestamp: '2026-02-28T12:00:01Z',
    };
    expect(MessageAckValidator.Check(ack)).toBe(true);
  });

  it('validates a signed ack', () => {
    const ack = {
      type: 'message_ack',
      correlation_id: 'corr-001',
      status: 'accepted',
      timestamp: '2026-02-28T12:00:01Z',
      signature: 'base64url-signature',
    };
    expect(MessageAckValidator.Check(ack)).toBe(true);
  });

  it('rejects invalid status', () => {
    const ack = {
      type: 'message_ack',
      correlation_id: 'corr-001',
      status: 'pending',
      timestamp: '2026-02-28T12:00:01Z',
    };
    expect(MessageAckValidator.Check(ack)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rejection Reasons
// ---------------------------------------------------------------------------

describe('RejectionReasonSchema', () => {
  const validReasons = [
    'invalid_signature',
    'unknown_sender',
    'consent_required',
    'schema_validation_failed',
    'storage_error',
    'internal_error',
  ];

  for (const reason of validReasons) {
    it(`accepts '${reason}'`, () => {
      expect(Value.Check(RejectionReasonSchema, reason)).toBe(true);
    });
  }

  it('rejects unknown reason', () => {
    expect(Value.Check(RejectionReasonSchema, 'bad_reason')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Connection Auth Token
// ---------------------------------------------------------------------------

describe('ConnectionAuthTokenSchema', () => {
  const validToken = {
    type: 'connection_auth' as const,
    provider_npi: '1234567890',
    provider_entity_id: 'provider-entity-001',
    timestamp: '2026-02-28T12:00:00Z',
    patient_agent_id: 'patient-agent-001',
    signature: 'base64url-sig',
    sender_public_key: 'base64url-pubkey',
  };

  it('validates a complete auth token', () => {
    expect(ConnectionAuthTokenValidator.Check(validToken)).toBe(true);
  });

  it('rejects missing provider_npi', () => {
    const { provider_npi: _, ...noNpi } = validToken;
    expect(ConnectionAuthTokenValidator.Check(noNpi)).toBe(false);
  });

  it('rejects invalid NPI format', () => {
    expect(ConnectionAuthTokenValidator.Check({ ...validToken, provider_npi: '123' })).toBe(false);
  });

  it('rejects wrong type', () => {
    expect(ConnectionAuthTokenValidator.Check({ ...validToken, type: 'wrong' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Known Provider
// ---------------------------------------------------------------------------

describe('KnownProviderSchema', () => {
  it('validates a known provider with active trust level', () => {
    const provider = {
      npi: '1234567890',
      provider_name: 'Dr. Smith',
      public_key: 'base64url-key',
      trust_level: 'active',
    };
    expect(Value.Check(KnownProviderSchema, provider)).toBe(true);
  });

  it('validates with optional fields', () => {
    const provider = {
      npi: '1234567890',
      provider_name: 'Dr. Smith',
      public_key: 'base64url-key',
      trust_level: 'active',
      connection_id: 'conn-001',
      neuron_endpoint: 'wss://neuron.example.com/ws',
    };
    expect(Value.Check(KnownProviderSchema, provider)).toBe(true);
  });

  it('accepts all trust levels', () => {
    for (const level of ['pending', 'active', 'suspended', 'revoked']) {
      expect(Value.Check(KnownProviderSchema, {
        npi: '1234567890',
        provider_name: 'Dr. Smith',
        public_key: 'key',
        trust_level: level,
      })).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Encrypted Payload
// ---------------------------------------------------------------------------

describe('EncryptedPayloadSchema', () => {
  it('validates an encrypted payload', () => {
    expect(Value.Check(EncryptedPayloadSchema, {
      ciphertext: 'base64-ciphertext',
      iv: 'base64-iv',
      auth_tag: 'base64-auth-tag',
    })).toBe(true);
  });

  it('rejects missing auth_tag', () => {
    expect(Value.Check(EncryptedPayloadSchema, {
      ciphertext: 'base64-ciphertext',
      iv: 'base64-iv',
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Message Ledger Entry
// ---------------------------------------------------------------------------

describe('MessageLedgerEntrySchema', () => {
  it('validates a complete ledger entry', () => {
    const entry = {
      type: 'clinical_message_received',
      correlation_id: 'corr-001',
      sender_npi: '1234567890',
      sender_name: 'Dr. Smith',
      message_type: 'clinical_summary',
      received_at: '2026-02-28T12:00:01Z',
      sent_at: '2026-02-28T12:00:00Z',
      encrypted_payload: {
        ciphertext: 'base64-ct',
        iv: 'base64-iv',
        auth_tag: 'base64-tag',
      },
      signature_verified: true,
      consent_granted: true,
    };
    expect(Value.Check(MessageLedgerEntrySchema, entry)).toBe(true);
  });

  it('rejects signature_verified: false', () => {
    const entry = {
      type: 'clinical_message_received',
      correlation_id: 'corr-001',
      sender_npi: '1234567890',
      sender_name: 'Dr. Smith',
      message_type: 'clinical_summary',
      received_at: '2026-02-28T12:00:01Z',
      sent_at: '2026-02-28T12:00:00Z',
      encrypted_payload: {
        ciphertext: 'base64-ct',
        iv: 'base64-iv',
        auth_tag: 'base64-tag',
      },
      signature_verified: false,
      consent_granted: true,
    };
    expect(Value.Check(MessageLedgerEntrySchema, entry)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Server Config
// ---------------------------------------------------------------------------

describe('MessagingServerConfigSchema', () => {
  it('validates a minimal config', () => {
    expect(Value.Check(MessagingServerConfigSchema, {
      port: 8080,
      patientAgentId: 'patient-001',
    })).toBe(true);
  });

  it('validates with optional host', () => {
    expect(Value.Check(MessagingServerConfigSchema, {
      port: 8080,
      host: '0.0.0.0',
      patientAgentId: 'patient-001',
    })).toBe(true);
  });

  it('rejects port out of range', () => {
    expect(Value.Check(MessagingServerConfigSchema, {
      port: 70000,
      patientAgentId: 'patient-001',
    })).toBe(false);
  });
});
