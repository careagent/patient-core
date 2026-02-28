/**
 * Consent engine -- the patient's sovereignty gate.
 *
 * Enforces per-action consent checking against the patient's configured
 * posture. Every action (data access, messaging, handshake, ACL changes)
 * must pass through this engine before proceeding.
 *
 * Three consent postures:
 * - deny-all: deny everything unless an explicit consent record exists
 * - allow-trusted: auto-allow for trust-listed providers with active status
 * - custom: per-action rules defined by the patient
 *
 * Consent records are stored in-memory (ledger entries are written via the
 * audit pipeline for persistence). Expired and revoked consents are treated
 * as denials.
 *
 * Bilateral correlation IDs link patient-side and provider-side audit entries.
 */

import { randomUUID } from 'node:crypto';
import type {
  ConsentAction,
  ConsentDecision,
  ConsentRecord,
  ConsentPosture,
  HealthLiteracyLevel,
  ConsentEngineConfig,
  CustomConsentRule,
  ConsentPrompt,
} from './schemas.js';
import { generateConsentPrompt } from './prompts.js';

// ---------------------------------------------------------------------------
// ConsentEngine interface
// ---------------------------------------------------------------------------

export interface ConsentEngine {
  /** Check if an action is consented. */
  check(params: {
    action: ConsentAction;
    actorId: string;
    resourceId?: string;
  }): ConsentDecision;

  /** Record a consent decision. */
  record(params: {
    action: ConsentAction;
    actorId: string;
    decision: 'allow' | 'deny';
    expiresAt?: string;
    literacyLevel?: HealthLiteracyLevel;
  }): ConsentRecord;

  /** Revoke a previously granted consent. */
  revoke(consentId: string): void;

  /** Get consent prompt text at specified literacy level. */
  getPrompt(params: {
    action: ConsentAction;
    actorId: string;
    literacyLevel: HealthLiteracyLevel;
  }): ConsentPrompt;

  /** Get all consent records (for inspection/debugging). */
  getRecords(): ConsentRecord[];

  /** Get the current posture. */
  getPosture(): ConsentPosture;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a consent engine instance with the given configuration. */
export function createConsentEngine(config: ConsentEngineConfig): ConsentEngine {
  const records: ConsentRecord[] = [];
  const posture: ConsentPosture = config.posture;
  const trustList = config.trustList ?? [];
  const customRules: CustomConsentRule[] = config.customRules ?? [];
  const defaultLiteracyLevel: HealthLiteracyLevel = config.defaultLiteracyLevel ?? 'basic';

  function check(params: {
    action: ConsentAction;
    actorId: string;
    resourceId?: string;
  }): ConsentDecision {
    const { action, actorId } = params;

    // First, check for an explicit consent record (most specific wins)
    const record = findActiveRecord(action, actorId);
    if (record) {
      return {
        allowed: record.decision === 'allow',
        reason: record.decision === 'allow'
          ? `Explicit consent granted (record ${record.id})`
          : `Explicit consent denied (record ${record.id})`,
        consentId: record.id,
        correlationId: record.correlationId,
        requiresPrompt: false,
      };
    }

    // Apply posture-based decision
    switch (posture) {
      case 'deny-all':
        return {
          allowed: false,
          reason: 'Deny-all posture: no consent record found',
          requiresPrompt: true,
        };

      case 'allow-trusted': {
        const trusted = trustList.find(t => t.npi === actorId && t.trust_level === 'active');
        if (trusted) {
          return {
            allowed: true,
            reason: `Trusted provider: ${trusted.provider_name} (NPI: ${trusted.npi})`,
            requiresPrompt: false,
          };
        }
        return {
          allowed: false,
          reason: `Actor ${actorId} is not in the trust list with active status`,
          requiresPrompt: true,
        };
      }

      case 'custom': {
        // Check custom rules: actor-specific rules take priority
        const specificRule = customRules.find(r => r.action === action && r.actorId === actorId);
        if (specificRule) {
          return {
            allowed: specificRule.decision === 'allow',
            reason: `Custom rule: ${specificRule.decision} for action ${action} by actor ${actorId}`,
            requiresPrompt: false,
          };
        }
        // Check action-level rule (no actor specified)
        const generalRule = customRules.find(r => r.action === action && !r.actorId);
        if (generalRule) {
          return {
            allowed: generalRule.decision === 'allow',
            reason: `Custom rule: ${generalRule.decision} for action ${action}`,
            requiresPrompt: false,
          };
        }
        // No matching rule: deny by default and prompt
        return {
          allowed: false,
          reason: `No custom rule matches action ${action} by actor ${actorId}`,
          requiresPrompt: true,
        };
      }
    }
  }

  function record(params: {
    action: ConsentAction;
    actorId: string;
    decision: 'allow' | 'deny';
    expiresAt?: string;
    literacyLevel?: HealthLiteracyLevel;
  }): ConsentRecord {
    const consentRecord: ConsentRecord = {
      id: randomUUID(),
      action: params.action,
      actorId: params.actorId,
      decision: params.decision,
      correlationId: randomUUID(),
      createdAt: new Date().toISOString(),
      expiresAt: params.expiresAt,
      revoked: false,
      literacyLevel: params.literacyLevel ?? defaultLiteracyLevel,
    };
    records.push(consentRecord);
    return consentRecord;
  }

  function revoke(consentId: string): void {
    const rec = records.find(r => r.id === consentId);
    if (!rec) {
      throw new Error(`Consent record ${consentId} not found`);
    }
    if (rec.revoked) {
      throw new Error(`Consent record ${consentId} is already revoked`);
    }
    rec.revoked = true;
    rec.revokedAt = new Date().toISOString();
  }

  function getPrompt(params: {
    action: ConsentAction;
    actorId: string;
    literacyLevel: HealthLiteracyLevel;
  }): ConsentPrompt {
    const correlationId = randomUUID();
    const text = generateConsentPrompt(
      params.action,
      params.actorId,
      params.literacyLevel,
      correlationId,
    );
    return {
      action: params.action,
      actorId: params.actorId,
      literacyLevel: params.literacyLevel,
      text,
      correlationId,
    };
  }

  function getRecords(): ConsentRecord[] {
    return [...records];
  }

  function getPosture(): ConsentPosture {
    return posture;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  function findActiveRecord(action: ConsentAction, actorId: string): ConsentRecord | undefined {
    const now = new Date().toISOString();
    // Search in reverse order so most recent record wins
    for (let i = records.length - 1; i >= 0; i--) {
      const rec = records[i];
      if (rec.action !== action || rec.actorId !== actorId) continue;
      if (rec.revoked) continue;
      if (rec.expiresAt && rec.expiresAt <= now) continue;
      return rec;
    }
    return undefined;
  }

  return {
    check,
    record,
    revoke,
    getPrompt,
    getRecords,
    getPosture,
  };
}
