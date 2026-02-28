/**
 * Axon registry discovery client.
 *
 * Queries the Axon trust registry by NPI to discover registered providers,
 * then initiates a cryptographic consent handshake via the broker pipeline.
 *
 * Two-phase flow:
 * 1. discoverProvider(npi) -- lookup provider in registry
 * 2. requestConnection(npi, patientId, privateKey, publicKey) -- signed connect request
 *
 * All responses are validated against TypeBox schemas before use.
 * No PHI is transmitted -- only identity, credentials, and endpoint information.
 */

import type { KeyObject } from 'node:crypto';
import {
  RegistryEntryValidator,
  ConnectGrantValidator,
  ConnectDenialValidator,
  type RegistryEntry,
  type ConnectGrant,
  type ConnectDenial,
  type DiscoveryResult,
  type HandshakeResult,
} from './schemas.js';
import {
  publicKeyToBase64Url,
  signPayload,
  generateNonce,
} from './crypto.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AxonClientConfig {
  /** Base URL of the Axon registry (e.g., 'http://localhost:3000'). */
  axonUrl: string;
  /** Optional fetch implementation for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface AxonClient {
  /** Query the Axon registry for a provider by NPI. Returns null if not found. */
  discoverProvider(npi: string): Promise<DiscoveryResult>;

  /**
   * Send a signed connect request to Axon broker.
   * Creates a ConnectRequest, signs it with the patient's private key,
   * and sends it to POST /v1/connect.
   */
  requestConnection(
    providerNpi: string,
    patientAgentId: string,
    privateKey: KeyObject,
    publicKey: KeyObject,
  ): Promise<HandshakeResult>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAxonClient(config: AxonClientConfig): AxonClient {
  const { axonUrl } = config;
  const fetchFn = config.fetchFn ?? globalThis.fetch;

  async function discoverProvider(npi: string): Promise<DiscoveryResult> {
    let res: Response;
    try {
      res = await fetchFn(`${axonUrl}/v1/registry/${encodeURIComponent(npi)}`);
    } catch (err) {
      return {
        found: false,
        error: `Network error querying Axon registry: ${(err as Error).message}`,
      };
    }

    if (res.status === 404) {
      return { found: false };
    }

    if (!res.ok) {
      return {
        found: false,
        error: `Axon registry returned status ${res.status}`,
      };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { found: false, error: 'Invalid JSON response from Axon registry' };
    }

    // Validate response against TypeBox schema
    if (!RegistryEntryValidator.Check(body)) {
      return { found: false, error: 'Axon response failed schema validation' };
    }

    const entry = body as RegistryEntry;

    // Resolve neuron endpoint URL
    const neuronEndpoint = resolveNeuronEndpoint(entry);

    return {
      found: true,
      provider: entry,
      neuronEndpoint,
    };
  }

  async function requestConnection(
    providerNpi: string,
    patientAgentId: string,
    privateKey: KeyObject,
    publicKey: KeyObject,
  ): Promise<HandshakeResult> {
    const patientPublicKeyB64 = publicKeyToBase64Url(publicKey);

    // Build the ConnectRequest payload
    const connectRequest = {
      version: '1.0.0' as const,
      type: 'connect_request' as const,
      timestamp: new Date().toISOString(),
      nonce: generateNonce(),
      patient_agent_id: patientAgentId,
      provider_npi: providerNpi,
      patient_public_key: patientPublicKeyB64,
    };

    // Serialize to JSON (these exact bytes get signed)
    const payloadStr = JSON.stringify(connectRequest);

    // Sign the payload bytes
    const signature = signPayload(payloadStr, privateKey);

    // Encode payload as base64url
    const payloadB64 = Buffer.from(payloadStr).toString('base64url');

    // Build signed message envelope
    const signedMessage = {
      signed_message: {
        payload: payloadB64,
        signature,
      },
      patient_public_key: patientPublicKeyB64,
    };

    let res: Response;
    try {
      res = await fetchFn(`${axonUrl}/v1/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signedMessage),
      });
    } catch (err) {
      return {
        status: 'error',
        error: `Network error connecting to Axon: ${(err as Error).message}`,
      };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { status: 'error', error: 'Invalid JSON response from Axon broker' };
    }

    // Check for grant (200)
    if (res.ok && ConnectGrantValidator.Check(body)) {
      const grant = body as ConnectGrant;
      return {
        status: 'granted',
        connectionId: grant.connection_id,
        neuronEndpoint: grant.neuron_endpoint,
      };
    }

    // Check for denial (400/403)
    if (ConnectDenialValidator.Check(body)) {
      const denial = body as ConnectDenial;
      return {
        status: 'denied',
        connectionId: denial.connection_id,
        denialCode: denial.code,
        denialMessage: denial.message,
      };
    }

    return {
      status: 'error',
      error: `Unexpected response from Axon broker (status ${res.status})`,
    };
  }

  return { discoverProvider, requestConnection };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the neuron endpoint URL from a registry entry.
 * Organizations have their own neuron_endpoint.
 * Individual providers reference their first affiliation's neuron_endpoint.
 */
function resolveNeuronEndpoint(entry: RegistryEntry): string | undefined {
  if (entry.entity_type === 'organization' && entry.neuron_endpoint) {
    return entry.neuron_endpoint.url;
  }
  if (entry.affiliations && entry.affiliations.length > 0) {
    return entry.affiliations[0]!.neuron_endpoint;
  }
  return undefined;
}
