/**
 * Tests for discovery module TypeBox schemas.
 *
 * Validates that all Axon API schemas correctly accept valid data
 * and reject invalid data at the boundary.
 */

import { describe, it, expect } from 'vitest';
import {
  RegistryEntryValidator,
  ConnectGrantValidator,
  ConnectDenialValidator,
  SignedMessageValidator,
} from '../../../src/discovery/schemas.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRegistryEntry(overrides?: Record<string, unknown>) {
  return {
    npi: '1234567890',
    entity_type: 'individual',
    name: 'Dr. Smith',
    credential_status: 'active',
    provider_types: ['MD'],
    degrees: ['MD'],
    specialty: 'Cardiology',
    credentials: [
      {
        type: 'license',
        issuer: 'State Board',
        identifier: 'LIC-12345',
        status: 'active',
        verification_source: 'self_attested',
      },
    ],
    affiliations: [
      {
        organization_npi: '9876543210',
        organization_name: 'General Hospital',
        neuron_endpoint: 'https://neuron.example.com/ws',
      },
    ],
    registered_at: '2025-01-01T00:00:00Z',
    last_updated: '2025-06-01T00:00:00Z',
    registry_version: '1.0.0',
    ...overrides,
  };
}

function makeOrganizationEntry() {
  return {
    npi: '9876543210',
    entity_type: 'organization',
    name: 'General Hospital',
    credential_status: 'active',
    organization_name: 'General Hospital',
    neuron_endpoint: {
      url: 'https://neuron.example.com/ws',
      protocol_version: '1.0.0',
      health_status: 'reachable',
      last_heartbeat: new Date().toISOString(),
    },
    credentials: [],
    registered_at: '2025-01-01T00:00:00Z',
    last_updated: '2025-06-01T00:00:00Z',
    registry_version: '1.0.0',
  };
}

// ---------------------------------------------------------------------------
// RegistryEntry Schema
// ---------------------------------------------------------------------------

describe('RegistryEntryValidator', () => {
  it('accepts a valid individual provider entry', () => {
    expect(RegistryEntryValidator.Check(makeRegistryEntry())).toBe(true);
  });

  it('accepts a valid organization entry', () => {
    expect(RegistryEntryValidator.Check(makeOrganizationEntry())).toBe(true);
  });

  it('accepts entry without optional fields', () => {
    const entry = makeRegistryEntry();
    delete (entry as Record<string, unknown>).provider_types;
    delete (entry as Record<string, unknown>).degrees;
    delete (entry as Record<string, unknown>).specialty;
    delete (entry as Record<string, unknown>).affiliations;
    expect(RegistryEntryValidator.Check(entry)).toBe(true);
  });

  it('rejects entry with invalid credential_status', () => {
    const entry = makeRegistryEntry({ credential_status: 'invalid' });
    expect(RegistryEntryValidator.Check(entry)).toBe(false);
  });

  it('rejects entry missing required fields', () => {
    const entry = makeRegistryEntry();
    delete (entry as Record<string, unknown>).npi;
    expect(RegistryEntryValidator.Check(entry)).toBe(false);
  });

  it('rejects entry with invalid entity_type', () => {
    const entry = makeRegistryEntry({ entity_type: 'robot' });
    expect(RegistryEntryValidator.Check(entry)).toBe(false);
  });

  it('accepts all credential statuses', () => {
    for (const status of ['active', 'pending', 'expired', 'suspended', 'revoked']) {
      const entry = makeRegistryEntry({ credential_status: status });
      expect(RegistryEntryValidator.Check(entry)).toBe(true);
    }
  });

  it('rejects entry with invalid neuron_endpoint health_status', () => {
    const entry = makeOrganizationEntry();
    (entry.neuron_endpoint as Record<string, unknown>).health_status = 'broken';
    expect(RegistryEntryValidator.Check(entry)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConnectGrant Schema
// ---------------------------------------------------------------------------

describe('ConnectGrantValidator', () => {
  it('accepts a valid grant', () => {
    const grant = {
      type: 'connect_grant',
      connection_id: '550e8400-e29b-41d4-a716-446655440000',
      provider_npi: '1234567890',
      neuron_endpoint: 'https://neuron.example.com/ws',
      protocol_version: '1.0.0',
    };
    expect(ConnectGrantValidator.Check(grant)).toBe(true);
  });

  it('rejects grant with wrong type', () => {
    const grant = {
      type: 'connect_denial',
      connection_id: 'id',
      provider_npi: '1234567890',
      neuron_endpoint: 'url',
      protocol_version: '1.0.0',
    };
    expect(ConnectGrantValidator.Check(grant)).toBe(false);
  });

  it('rejects grant missing required field', () => {
    const grant = {
      type: 'connect_grant',
      connection_id: 'id',
      provider_npi: '1234567890',
    };
    expect(ConnectGrantValidator.Check(grant)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConnectDenial Schema
// ---------------------------------------------------------------------------

describe('ConnectDenialValidator', () => {
  it('accepts a valid denial', () => {
    const denial = {
      type: 'connect_denial',
      connection_id: 'id',
      code: 'PROVIDER_NOT_FOUND',
      message: 'Provider not found',
    };
    expect(ConnectDenialValidator.Check(denial)).toBe(true);
  });

  it('accepts all denial codes', () => {
    const codes = [
      'SIGNATURE_INVALID',
      'NONCE_REPLAYED',
      'TIMESTAMP_EXPIRED',
      'PROVIDER_NOT_FOUND',
      'CREDENTIALS_INVALID',
      'ENDPOINT_UNAVAILABLE',
    ];
    for (const code of codes) {
      const denial = {
        type: 'connect_denial',
        connection_id: 'id',
        code,
        message: 'some message',
      };
      expect(ConnectDenialValidator.Check(denial)).toBe(true);
    }
  });

  it('rejects denial with invalid code', () => {
    const denial = {
      type: 'connect_denial',
      connection_id: 'id',
      code: 'INVALID_CODE',
      message: 'msg',
    };
    expect(ConnectDenialValidator.Check(denial)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SignedMessage Schema
// ---------------------------------------------------------------------------

describe('SignedMessageValidator', () => {
  it('accepts valid base64url strings', () => {
    const msg = {
      payload: 'eyJ0ZXN0IjoiZGF0YSJ9',
      signature: 'c2lnbmF0dXJl',
    };
    expect(SignedMessageValidator.Check(msg)).toBe(true);
  });

  it('rejects payload with padding characters', () => {
    const msg = {
      payload: 'eyJ0ZXN0IjoiZGF0YSJ9==',
      signature: 'c2lnbmF0dXJl',
    };
    expect(SignedMessageValidator.Check(msg)).toBe(false);
  });

  it('rejects payload with + character (base64 not base64url)', () => {
    const msg = {
      payload: 'eyJ0ZXN0+joiZGF0YSJ9',
      signature: 'c2lnbmF0dXJl',
    };
    expect(SignedMessageValidator.Check(msg)).toBe(false);
  });
});
