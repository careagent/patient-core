/**
 * Tests for the Axon registry discovery client.
 *
 * All tests use mock fetch -- no live network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { createAxonClient } from '../../../src/discovery/client.js';

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

function makeConnectGrant() {
  return {
    type: 'connect_grant' as const,
    connection_id: '550e8400-e29b-41d4-a716-446655440000',
    provider_npi: '1234567890',
    neuron_endpoint: 'https://neuron.example.com/ws',
    protocol_version: '1.0.0',
  };
}

function makeConnectDenial(code = 'PROVIDER_NOT_FOUND') {
  return {
    type: 'connect_denial' as const,
    connection_id: '550e8400-e29b-41d4-a716-446655440001',
    code,
    message: `Provider not found`,
  };
}

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

const AXON_URL = 'http://axon.test:3000';

// ---------------------------------------------------------------------------
// discoverProvider
// ---------------------------------------------------------------------------

describe('discoverProvider', () => {
  it('returns found=true with provider data on 200', async () => {
    const entry = makeRegistryEntry();
    const fetchFn = mockFetch(200, entry);
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('1234567890');

    expect(result.found).toBe(true);
    expect(result.provider).toEqual(entry);
    expect(result.neuronEndpoint).toBe('https://neuron.example.com/ws');
    expect(fetchFn).toHaveBeenCalledWith(`${AXON_URL}/v1/registry/1234567890`);
  });

  it('returns found=false with no error on 404', async () => {
    const fetchFn = mockFetch(404, { error: 'not found' });
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('0000000000');

    expect(result.found).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.provider).toBeUndefined();
  });

  it('returns found=false with error on 500', async () => {
    const fetchFn = mockFetch(500, { error: 'internal' });
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('1234567890');

    expect(result.found).toBe(false);
    expect(result.error).toContain('500');
  });

  it('returns found=false on network error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('1234567890');

    expect(result.found).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('returns found=false on invalid JSON response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    }) as unknown as typeof fetch;
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('1234567890');

    expect(result.found).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('returns found=false when response fails schema validation', async () => {
    const invalidEntry = { npi: '123' }; // missing required fields
    const fetchFn = mockFetch(200, invalidEntry);
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('1234567890');

    expect(result.found).toBe(false);
    expect(result.error).toContain('schema validation');
  });

  it('resolves neuron endpoint for organization entries', async () => {
    const orgEntry = {
      npi: '9876543210',
      entity_type: 'organization',
      name: 'General Hospital',
      credential_status: 'active',
      organization_name: 'General Hospital',
      neuron_endpoint: {
        url: 'https://neuron.example.com/ws',
        protocol_version: '1.0.0',
        health_status: 'reachable',
      },
      credentials: [],
      registered_at: '2025-01-01T00:00:00Z',
      last_updated: '2025-06-01T00:00:00Z',
      registry_version: '1.0.0',
    };
    const fetchFn = mockFetch(200, orgEntry);
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('9876543210');

    expect(result.found).toBe(true);
    expect(result.neuronEndpoint).toBe('https://neuron.example.com/ws');
  });

  it('resolves neuron endpoint from individual provider affiliations', async () => {
    const entry = makeRegistryEntry();
    const fetchFn = mockFetch(200, entry);
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('1234567890');

    expect(result.neuronEndpoint).toBe('https://neuron.example.com/ws');
  });

  it('returns undefined neuron endpoint when no affiliations', async () => {
    const entry = makeRegistryEntry({ affiliations: undefined });
    const fetchFn = mockFetch(200, entry);
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.discoverProvider('1234567890');

    expect(result.found).toBe(true);
    expect(result.neuronEndpoint).toBeUndefined();
  });

  it('URL-encodes the NPI parameter', async () => {
    const fetchFn = mockFetch(404, {});
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    await client.discoverProvider('12 34');
    expect(fetchFn).toHaveBeenCalledWith(`${AXON_URL}/v1/registry/12%2034`);
  });
});

// ---------------------------------------------------------------------------
// requestConnection
// ---------------------------------------------------------------------------

describe('requestConnection', () => {
  let privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
  let publicKey: ReturnType<typeof generateKeyPairSync>['publicKey'];

  beforeEach(() => {
    const kp = generateKeyPairSync('ed25519');
    privateKey = kp.privateKey;
    publicKey = kp.publicKey;
  });

  it('returns granted status on successful connection', async () => {
    const grant = makeConnectGrant();
    const fetchFn = mockFetch(200, grant);
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.requestConnection(
      '1234567890',
      'patient-uuid',
      privateKey,
      publicKey,
    );

    expect(result.status).toBe('granted');
    expect(result.connectionId).toBe(grant.connection_id);
    expect(result.neuronEndpoint).toBe(grant.neuron_endpoint);
  });

  it('sends correct POST request to /v1/connect', async () => {
    const fetchFn = mockFetch(200, makeConnectGrant());
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    await client.requestConnection('1234567890', 'patient-1', privateKey, publicKey);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${AXON_URL}/v1/connect`);
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

    // Verify the body structure
    const body = JSON.parse(options.body as string);
    expect(body.signed_message).toBeDefined();
    expect(body.signed_message.payload).toBeDefined();
    expect(body.signed_message.signature).toBeDefined();
    expect(body.patient_public_key).toBeDefined();

    // Verify the payload decodes to a valid ConnectRequest
    const payload = JSON.parse(Buffer.from(body.signed_message.payload, 'base64url').toString());
    expect(payload.version).toBe('1.0.0');
    expect(payload.type).toBe('connect_request');
    expect(payload.provider_npi).toBe('1234567890');
    expect(payload.patient_agent_id).toBe('patient-1');
    expect(payload.patient_public_key).toBeDefined();
    expect(payload.nonce).toBeDefined();
    expect(payload.timestamp).toBeDefined();
  });

  it('returns denied status with code and message', async () => {
    const denial = makeConnectDenial('CREDENTIALS_INVALID');
    const fetchFn = mockFetch(403, denial);
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.requestConnection(
      '1234567890',
      'patient-uuid',
      privateKey,
      publicKey,
    );

    expect(result.status).toBe('denied');
    expect(result.denialCode).toBe('CREDENTIALS_INVALID');
    expect(result.denialMessage).toBeDefined();
  });

  it('returns error status on network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.requestConnection(
      '1234567890',
      'patient-uuid',
      privateKey,
      publicKey,
    );

    expect(result.status).toBe('error');
    expect(result.error).toContain('timeout');
  });

  it('returns error on invalid JSON response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad json')),
    }) as unknown as typeof fetch;
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.requestConnection(
      '1234567890',
      'patient-uuid',
      privateKey,
      publicKey,
    );

    expect(result.status).toBe('error');
    expect(result.error).toContain('Invalid JSON');
  });

  it('returns error on unexpected response format', async () => {
    const fetchFn = mockFetch(200, { unexpected: true });
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    const result = await client.requestConnection(
      '1234567890',
      'patient-uuid',
      privateKey,
      publicKey,
    );

    expect(result.status).toBe('error');
    expect(result.error).toContain('Unexpected response');
  });

  it('signs the payload with the patient private key (Ed25519)', async () => {
    const { verify: cryptoVerify } = await import('node:crypto');
    const fetchFn = mockFetch(200, makeConnectGrant());
    const client = createAxonClient({ axonUrl: AXON_URL, fetchFn });

    await client.requestConnection('1234567890', 'patient-1', privateKey, publicKey);

    const [, options] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);

    // Decode and verify the signature
    const payloadBytes = Buffer.from(body.signed_message.payload, 'base64url');
    const signatureBytes = Buffer.from(body.signed_message.signature, 'base64url');

    const isValid = cryptoVerify(null, payloadBytes, publicKey, signatureBytes);
    expect(isValid).toBe(true);
  });
});
