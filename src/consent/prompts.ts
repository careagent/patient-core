/**
 * Consent prompt generation -- adapts consent prompts to patient health literacy level.
 *
 * Three literacy levels:
 * - basic: simple language, yes/no questions
 * - intermediate: includes clinical identifiers and scope details
 * - advanced: full technical details including correlation IDs and action types
 */

import type { ConsentAction, HealthLiteracyLevel } from './schemas.js';

// ---------------------------------------------------------------------------
// Action descriptions by literacy level
// ---------------------------------------------------------------------------

const ACTION_DESCRIPTIONS: Record<ConsentAction, Record<HealthLiteracyLevel, string>> = {
  'data:read': {
    basic: 'wants to see your health records',
    intermediate: 'is requesting read access to your health records',
    advanced: 'requests consent for action data:read on patient health records (read-only, no write access)',
  },
  'data:write': {
    basic: 'wants to add information to your health records',
    intermediate: 'is requesting write access to your health records. This will allow them to add or update clinical data',
    advanced: 'requests consent for action data:write on patient health records (write access, may create or modify entries)',
  },
  'message:send': {
    basic: 'Your agent wants to send a message',
    intermediate: 'Your patient agent is requesting permission to send a message on your behalf',
    advanced: 'Agent requests consent for action message:send (outbound message transmission)',
  },
  'message:receive': {
    basic: 'wants to send you a message',
    intermediate: 'is requesting permission to deliver a message to your agent',
    advanced: 'requests consent for action message:receive (inbound message delivery to patient agent)',
  },
  'acl:grant': {
    basic: 'wants to give access to someone',
    intermediate: 'is requesting permission to grant access rights',
    advanced: 'requests consent for action acl:grant (access control list modification, grant)',
  },
  'acl:revoke': {
    basic: 'wants to remove someone\'s access',
    intermediate: 'is requesting permission to revoke access rights',
    advanced: 'requests consent for action acl:revoke (access control list modification, revoke)',
  },
  'handshake:initiate': {
    basic: 'Your agent wants to connect with a provider',
    intermediate: 'Your patient agent is requesting permission to initiate a connection handshake with a provider',
    advanced: 'Agent requests consent for action handshake:initiate (P2P connection establishment, initiator role)',
  },
  'handshake:accept': {
    basic: 'A provider wants to connect with you',
    intermediate: 'A provider is requesting to establish a connection with your patient agent',
    advanced: 'requests consent for action handshake:accept (P2P connection establishment, acceptor role)',
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable consent prompt at the specified literacy level.
 *
 * @param action - The action requiring consent
 * @param actorId - Who is performing/requesting the action
 * @param literacyLevel - Patient's health literacy level
 * @param correlationId - Bilateral correlation ID for audit linking
 * @returns The formatted consent prompt text
 */
export function generateConsentPrompt(
  action: ConsentAction,
  actorId: string,
  literacyLevel: HealthLiteracyLevel,
  correlationId: string,
): string {
  const description = ACTION_DESCRIPTIONS[action]?.[literacyLevel];
  if (!description) {
    return `Action "${action}" requires your consent. Allow? (Yes/No)`;
  }

  switch (literacyLevel) {
    case 'basic':
      return formatBasicPrompt(action, actorId, description);
    case 'intermediate':
      return formatIntermediatePrompt(action, actorId, description);
    case 'advanced':
      return formatAdvancedPrompt(action, actorId, description, correlationId);
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatBasicPrompt(
  action: ConsentAction,
  actorId: string,
  description: string,
): string {
  // For agent-initiated actions (message:send, handshake:initiate), the description is self-contained
  if (action === 'message:send' || action === 'handshake:initiate') {
    return `${description}. Allow? (Yes/No)`;
  }
  return `${actorId} ${description}. Allow? (Yes/No)`;
}

function formatIntermediatePrompt(
  action: ConsentAction,
  actorId: string,
  description: string,
): string {
  if (action === 'message:send' || action === 'handshake:initiate') {
    return `${description}. Allow this action? (Yes/No)`;
  }
  return `${actorId} ${description}. Allow this access? (Yes/No)`;
}

function formatAdvancedPrompt(
  action: ConsentAction,
  actorId: string,
  description: string,
  correlationId: string,
): string {
  if (action === 'message:send' || action === 'handshake:initiate') {
    return `${description}. Correlation ID: ${correlationId}. Grant consent? (Yes/No)`;
  }
  return `Provider entity ${actorId} ${description}. Correlation ID: ${correlationId}. Grant consent? (Yes/No)`;
}
