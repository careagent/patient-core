/**
 * Tests for the discovery + handshake orchestrator.
 *
 * Validates the full flow: discover provider -> request connection -> store ledger entry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { createDiscoveryHandshake } from '../../../src/discovery/handshake.js';
import type { AxonClient } from '../../../src/discovery/client.js';
import type { PatientChartVault } from '../../../src/chart/types.js';
import type { DiscoveryResult, HandshakeResult } from '../../../src/discovery/schemas.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDiscoveryFound(): DiscoveryResult {
  return {
    found: true,
    provider: {
      npi: '1234567890',
      entity_type: 'individual',
      name: 'Dr. Smith',
      credential_status: 'active',
      credentials: [],
      registered_at: '2025-01-01T00:00:00Z',
      last_updated: '2025-06-01T00:00:00Z',
      registry_version: '1.0.0',
    },
    neuronEndpoint: 'https://neuron.example.com/ws',
  };
}

function makeDiscoveryNotFound(): DiscoveryResult {
  return { found: false };
}

function makeHandshakeGranted(): HandshakeResult {
  return {
    status: 'granted',
    connectionId: 'conn-123',
    neuronEndpoint: 'https://neuron.example.com/ws',
  };
}

function makeHandshakeDenied(): HandshakeResult {
  return {
    status: 'denied',
    connectionId: 'conn-456',
    denialCode: 'CREDENTIALS_INVALID',
    denialMessage: 'Provider credentials are not in active status',
  };
}

function makeHandshakeError(): HandshakeResult {
  return {
    status: 'error',
    error: 'Network timeout',
  };
}

function makeAxonClient(
  discoveryResult: DiscoveryResult,
  handshakeResult?: HandshakeResult,
): AxonClient {
  return {
    discoverProvider: vi.fn().mockResolvedValue(discoveryResult),
    requestConnection: vi.fn().mockResolvedValue(handshakeResult ?? makeHandshakeGranted()),
  };
}

function makeChartVault(): PatientChartVault {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue({ success: true }),
    checkAccess: vi.fn().mockResolvedValue(true),
  };
}

let privateKey: KeyObject;
let publicKey: KeyObject;

beforeEach(() => {
  const kp = generateKeyPairSync('ed25519');
  privateKey = kp.privateKey;
  publicKey = kp.publicKey;
});

// ---------------------------------------------------------------------------
// discoverAndConnect
// ---------------------------------------------------------------------------

describe('discoverAndConnect', () => {
  it('returns discovery + handshake result on success', async () => {
    const client = makeAxonClient(makeDiscoveryFound(), makeHandshakeGranted());
    const dh = createDiscoveryHandshake({ axonClient: client });

    const result = await dh.discoverAndConnect('1234567890', 'patient-1', privateKey, publicKey);

    expect(result.discovery.found).toBe(true);
    expect(result.handshake).toBeDefined();
    expect(result.handshake!.status).toBe('granted');
    expect(result.handshake!.connectionId).toBe('conn-123');
  });

  it('returns only discovery result when provider not found', async () => {
    const client = makeAxonClient(makeDiscoveryNotFound());
    const dh = createDiscoveryHandshake({ axonClient: client });

    const result = await dh.discoverAndConnect('0000000000', 'patient-1', privateKey, publicKey);

    expect(result.discovery.found).toBe(false);
    expect(result.handshake).toBeUndefined();
    expect(result.ledgerEntry).toBeUndefined();
  });

  it('does not call requestConnection when provider is not found', async () => {
    const client = makeAxonClient(makeDiscoveryNotFound());
    const dh = createDiscoveryHandshake({ axonClient: client });

    await dh.discoverAndConnect('0000000000', 'patient-1', privateKey, publicKey);

    expect(client.requestConnection).not.toHaveBeenCalled();
  });

  it('stores ledger entry in chart vault on granted', async () => {
    const vault = makeChartVault();
    const client = makeAxonClient(makeDiscoveryFound(), makeHandshakeGranted());
    const dh = createDiscoveryHandshake({ axonClient: client, chartVault: vault });

    const result = await dh.discoverAndConnect('1234567890', 'patient-1', privateKey, publicKey);

    expect(vault.write).toHaveBeenCalledTimes(1);
    const [recordId, data] = (vault.write as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    expect(recordId).toMatch(/^ledger:handshake:1234567890:/);
    expect(result.ledgerEntry).toBeDefined();
    expect(result.ledgerEntry!.type).toBe('handshake');
    expect(result.ledgerEntry!.provider_npi).toBe('1234567890');
    expect(result.ledgerEntry!.provider_name).toBe('Dr. Smith');
    expect(result.ledgerEntry!.status).toBe('granted');
    expect(result.ledgerEntry!.connection_id).toBe('conn-123');
  });

  it('stores ledger entry on denied', async () => {
    const vault = makeChartVault();
    const client = makeAxonClient(makeDiscoveryFound(), makeHandshakeDenied());
    const dh = createDiscoveryHandshake({ axonClient: client, chartVault: vault });

    const result = await dh.discoverAndConnect('1234567890', 'patient-1', privateKey, publicKey);

    expect(vault.write).toHaveBeenCalledTimes(1);
    expect(result.ledgerEntry!.status).toBe('denied');
    expect(result.ledgerEntry!.denial_code).toBe('CREDENTIALS_INVALID');
  });

  it('stores ledger entry on error', async () => {
    const vault = makeChartVault();
    const client = makeAxonClient(makeDiscoveryFound(), makeHandshakeError());
    const dh = createDiscoveryHandshake({ axonClient: client, chartVault: vault });

    const result = await dh.discoverAndConnect('1234567890', 'patient-1', privateKey, publicKey);

    expect(vault.write).toHaveBeenCalledTimes(1);
    expect(result.ledgerEntry!.status).toBe('error');
    expect(result.ledgerEntry!.error).toBe('Network timeout');
  });

  it('works without chart vault (no ledger storage)', async () => {
    const client = makeAxonClient(makeDiscoveryFound(), makeHandshakeGranted());
    const dh = createDiscoveryHandshake({ axonClient: client });

    const result = await dh.discoverAndConnect('1234567890', 'patient-1', privateKey, publicKey);

    expect(result.handshake!.status).toBe('granted');
    expect(result.ledgerEntry).toBeDefined();
    // No vault write, but ledger entry is still returned
  });

  it('passes correct arguments to requestConnection', async () => {
    const client = makeAxonClient(makeDiscoveryFound(), makeHandshakeGranted());
    const dh = createDiscoveryHandshake({ axonClient: client });

    await dh.discoverAndConnect('1234567890', 'patient-1', privateKey, publicKey);

    expect(client.requestConnection).toHaveBeenCalledWith(
      '1234567890',
      'patient-1',
      privateKey,
      publicKey,
    );
  });

  it('ledger entry timestamp is ISO 8601', async () => {
    const client = makeAxonClient(makeDiscoveryFound(), makeHandshakeGranted());
    const dh = createDiscoveryHandshake({ axonClient: client });

    const result = await dh.discoverAndConnect('1234567890', 'patient-1', privateKey, publicKey);

    expect(result.ledgerEntry!.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });
});

// ---------------------------------------------------------------------------
// discover (standalone, no handshake)
// ---------------------------------------------------------------------------

describe('discover', () => {
  it('returns discovery result without initiating handshake', async () => {
    const client = makeAxonClient(makeDiscoveryFound());
    const dh = createDiscoveryHandshake({ axonClient: client });

    const result = await dh.discover('1234567890');

    expect(result.found).toBe(true);
    expect(result.provider!.name).toBe('Dr. Smith');
    expect(client.requestConnection).not.toHaveBeenCalled();
  });

  it('returns not-found result', async () => {
    const client = makeAxonClient(makeDiscoveryNotFound());
    const dh = createDiscoveryHandshake({ axonClient: client });

    const result = await dh.discover('0000000000');

    expect(result.found).toBe(false);
  });
});
