/**
 * Consent-aware A2A communication broker.
 *
 * Wraps the existing consent engine patterns with A2A Agent Card and Task
 * semantics. Manages consent grants per provider, verifies consent before
 * allowing A2A communication, and initiates provider connections through
 * Neuron with Ed25519-signed consent tokens.
 *
 * Consent is deny-by-default. Every provider interaction must have an
 * explicit, unexpired, unrevoked consent grant before proceeding.
 */

import { randomUUID } from 'node:crypto';
import type { AgentCard, Task, Message } from '@careagent/a2a-types';
import type { PatientA2AClient } from './client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A consent grant for a specific provider interaction. */
export interface ConsentGrant {
  /** NPI of the provider this consent applies to. */
  provider_npi: string;
  /** Actions the patient consents to (e.g., 'consultation', 'share_history'). */
  consented_actions: string[];
  /** ISO 8601 expiration timestamp. */
  expiration: string;
  /** Ed25519-signed consent token for verification by Neuron. */
  token: string;
}

/**
 * Abstraction for patient message I/O during consent prompts.
 *
 * Mirrors the existing InterviewIO pattern from cli/io.ts but simplified
 * for consent-specific flows.
 */
export interface MessageIO {
  /** Send a message to the patient. */
  display(text: string): void;
  /** Ask the patient a yes/no question. Returns true for yes. */
  confirm(prompt: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// ConsentBroker
// ---------------------------------------------------------------------------

export class ConsentBroker {
  private grants: Map<string, ConsentGrant> = new Map();

  /**
   * Request consent from the patient for a specific interaction with a provider.
   *
   * Presents the provider's Agent Card information and requested actions to
   * the patient via the MessageIO interface. Returns a ConsentGrant if the
   * patient approves, or null if denied.
   */
  async requestConsent(
    providerCard: AgentCard,
    requestedActions: string[],
    messageIO: MessageIO,
  ): Promise<ConsentGrant | null> {
    const providerName = providerCard.name;
    const providerNpi = providerCard.careagent?.npi ?? 'unknown';
    const organization = providerCard.careagent?.organization ?? 'unknown practice';
    const specialty = providerCard.careagent?.specialty ?? 'unknown specialty';

    // Present the consent prompt
    messageIO.display(
      `A provider wants to interact with you:\n` +
      `  Name: ${providerName}\n` +
      `  NPI: ${providerNpi}\n` +
      `  Organization: ${organization}\n` +
      `  Specialty: ${specialty}\n` +
      `  Requested actions: ${requestedActions.join(', ')}`,
    );

    const approved = await messageIO.confirm(
      'Do you consent to this interaction?',
    );

    if (!approved) {
      return null;
    }

    // Generate consent grant with 24-hour expiration
    const expiration = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();

    const grant: ConsentGrant = {
      provider_npi: providerNpi,
      consented_actions: requestedActions,
      expiration,
      token: randomUUID(), // Placeholder -- Ed25519-signed token in production
    };

    this.grants.set(providerNpi, grant);
    return grant;
  }

  /**
   * Check whether consent exists for a specific action with a provider.
   *
   * Returns false if no grant exists, the grant is expired, or the action
   * is not in the consented actions list.
   */
  hasConsent(providerNpi: string, action: string): boolean {
    const grant = this.grants.get(providerNpi);
    if (!grant) {
      return false;
    }

    // Check expiration
    if (new Date(grant.expiration) <= new Date()) {
      return false;
    }

    return grant.consented_actions.includes(action);
  }

  /**
   * Revoke all consent for a provider.
   *
   * Removes the grant entirely. The provider must request consent again.
   */
  revokeConsent(providerNpi: string): void {
    this.grants.delete(providerNpi);
  }

  /**
   * Get the active consent grant for a provider, if any.
   */
  getConsent(providerNpi: string): ConsentGrant | undefined {
    return this.grants.get(providerNpi);
  }

  /**
   * Initiate a connection to a provider's Neuron with the consent token.
   *
   * Sends an A2A message to the Neuron with the consent token attached
   * as metadata. The Neuron verifies the token before brokering the
   * connection between patient and provider agents.
   */
  async connectToProvider(
    neuronUrl: string,
    consentGrant: ConsentGrant,
    a2aClient: PatientA2AClient,
  ): Promise<Task> {
    const message: Message = {
      role: 'user',
      parts: [
        {
          type: 'data',
          data: {
            type: 'consent_connection_request',
            provider_npi: consentGrant.provider_npi,
            consented_actions: consentGrant.consented_actions,
            expiration: consentGrant.expiration,
          },
          metadata: {
            classification: {
              domain: 'administrative',
              sensitivity: 'sensitive',
            },
          },
        },
      ],
      metadata: {
        consent_token: consentGrant.token,
      },
    };

    return a2aClient.sendMessage(neuronUrl, message);
  }
}
