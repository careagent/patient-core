/**
 * Patient-provider discovery and handshake orchestrator.
 *
 * Coordinates the full flow:
 * 1. Query Axon registry by NPI to discover a provider
 * 2. Request a signed connection through the Axon broker
 * 3. Store the handshake result as a ledger entry in the patient's chart vault
 *
 * This is the main entry point consumed by the Telegram bot and other callers.
 */

import type { KeyObject } from 'node:crypto';
import type { PatientChartClient } from '../chart/types.js';
import type { AxonClient } from './client.js';
import type { HandshakeResult, DiscoveryResult } from './schemas.js';

// ---------------------------------------------------------------------------
// Ledger entry types
// ---------------------------------------------------------------------------

export interface HandshakeLedgerEntry {
  type: 'handshake';
  timestamp: string;
  provider_npi: string;
  provider_name: string | undefined;
  status: 'granted' | 'denied' | 'error';
  connection_id: string | undefined;
  neuron_endpoint: string | undefined;
  denial_code: string | undefined;
  error: string | undefined;
}

// ---------------------------------------------------------------------------
// Orchestrator config
// ---------------------------------------------------------------------------

export interface DiscoveryHandshakeConfig {
  axonClient: AxonClient;
  chartVault?: PatientChartClient;
}

// ---------------------------------------------------------------------------
// Orchestrator interface
// ---------------------------------------------------------------------------

export interface DiscoveryHandshake {
  /**
   * Discover a provider by NPI and request a connection through Axon.
   *
   * Returns the combined result of discovery + handshake.
   * If discovery finds the provider, automatically proceeds to handshake.
   * Stores the result as a ledger entry in the patient's chart vault.
   */
  discoverAndConnect(
    npi: string,
    patientAgentId: string,
    privateKey: KeyObject,
    publicKey: KeyObject,
  ): Promise<DiscoveryAndHandshakeResult>;

  /** Discover a provider by NPI without initiating a handshake. */
  discover(npi: string): Promise<DiscoveryResult>;
}

export interface DiscoveryAndHandshakeResult {
  discovery: DiscoveryResult;
  handshake?: HandshakeResult;
  ledgerEntry?: HandshakeLedgerEntry;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDiscoveryHandshake(config: DiscoveryHandshakeConfig): DiscoveryHandshake {
  const { axonClient, chartVault } = config;

  async function discover(npi: string): Promise<DiscoveryResult> {
    return axonClient.discoverProvider(npi);
  }

  async function discoverAndConnect(
    npi: string,
    patientAgentId: string,
    privateKey: KeyObject,
    publicKey: KeyObject,
  ): Promise<DiscoveryAndHandshakeResult> {
    // Phase 1: Discover the provider
    const discovery = await axonClient.discoverProvider(npi);

    if (!discovery.found) {
      return { discovery };
    }

    // Phase 2: Request connection through Axon broker
    const handshake = await axonClient.requestConnection(
      npi,
      patientAgentId,
      privateKey,
      publicKey,
    );

    // Phase 3: Create and store ledger entry
    const ledgerEntry: HandshakeLedgerEntry = {
      type: 'handshake',
      timestamp: new Date().toISOString(),
      provider_npi: npi,
      provider_name: discovery.provider?.name,
      status: handshake.status,
      connection_id: handshake.connectionId,
      neuron_endpoint: handshake.neuronEndpoint,
      denial_code: handshake.denialCode,
      error: handshake.error,
    };

    if (chartVault) {
      chartVault.writeEntry(ledgerEntry, 'care_relationship_established');
    }

    return { discovery, handshake, ledgerEntry };
  }

  return { discoverAndConnect, discover };
}
