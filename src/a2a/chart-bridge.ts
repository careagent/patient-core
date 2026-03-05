/**
 * Bridge between A2A messages and the patient chart.
 *
 * Translates A2A Task/Message payloads into encrypted, signed, hash-chained
 * ledger entries in the patient chart vault. Also reads relevant medical
 * history from the chart and packages it as A2A Messages for sharing with
 * providers (respecting consent scope).
 *
 * Uses patient-chart APIs: KeyRing, LedgerWriter, createVault.
 * All entries are encrypted with AES-256-GCM and signed with Ed25519.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Task, Message } from '@careagent/a2a-types';
import {
  KeyRing,
  LedgerWriter,
  createVault,
  deriveMasterKey,
  generateSalt,
  ENTRIES_FILENAME,
  DEFAULT_KDF_PARAMS,
} from '@careagent/patient-chart';
import type {
  LedgerEntry,
  LedgerEntryType,
  EntryAuthor,
} from '@careagent/patient-chart';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ChartBridgeConfig {
  /** Absolute path to the vault directory. */
  vaultDir: string;
  /** Password/passphrase for the KeyRing. */
  keyRingPassword: string;
}

// ---------------------------------------------------------------------------
// ChartBridge
// ---------------------------------------------------------------------------

export class ChartBridge {
  readonly vaultDir: string;
  private readonly keyRingPassword: string;
  private keyRing: KeyRing | null = null;
  private ledgerWriter: LedgerWriter | null = null;

  constructor(config: ChartBridgeConfig) {
    this.vaultDir = config.vaultDir;
    this.keyRingPassword = config.keyRingPassword;
  }

  /**
   * Record a clinical interaction from an A2A task into the patient chart.
   *
   * Extracts the task's message history and artifacts, then writes a
   * clinical_encounter ledger entry with the interaction content encrypted.
   *
   * @returns The ledger entry ID.
   */
  async recordInteraction(
    task: Task,
    metadata: {
      provider_npi: string;
      interaction_type: string;
    },
  ): Promise<string> {
    const { writer, keyRing } = this.ensureInitialized();

    const content = {
      task_id: task.id,
      session_id: task.sessionId,
      interaction_type: metadata.interaction_type,
      provider_npi: metadata.provider_npi,
      messages: task.history ?? [],
      status: task.status.state,
      recorded_at: new Date().toISOString(),
    };

    const author = this.buildAuthor(keyRing);
    const entry = writer.writeEntry(
      content,
      'clinical_encounter' as LedgerEntryType,
      author,
      () => keyRing.getActiveEncryptionKey(),
      keyRing.getIdentityPrivateKey(),
    );

    return entry.id;
  }

  /**
   * Record an appointment from an A2A interaction.
   *
   * Creates a patient_note ledger entry with the appointment details.
   *
   * @returns The ledger entry ID.
   */
  async recordAppointment(appointment: {
    provider_npi: string;
    provider_name: string;
    datetime: string;
    reason: string;
  }): Promise<string> {
    const { writer, keyRing } = this.ensureInitialized();

    const content = {
      type: 'appointment',
      provider_npi: appointment.provider_npi,
      provider_name: appointment.provider_name,
      datetime: appointment.datetime,
      reason: appointment.reason,
      recorded_at: new Date().toISOString(),
    };

    const author = this.buildAuthor(keyRing);
    const entry = writer.writeEntry(
      content,
      'patient_note' as LedgerEntryType,
      author,
      () => keyRing.getActiveEncryptionKey(),
      keyRing.getIdentityPrivateKey(),
    );

    return entry.id;
  }

  /**
   * Get relevant medical history for sharing, respecting consent scope.
   *
   * Reads entry metadata (cleartext envelope) from the chart without
   * decrypting payloads. Filters to clinical entry types when consent
   * allows. Returns an A2A Message with a DataPart containing the
   * filtered history summary.
   */
  async getRelevantHistory(
    consentedActions: string[],
    conditions?: string[],
  ): Promise<Message> {
    const entriesPath = join(this.vaultDir, 'ledger', ENTRIES_FILENAME);

    // If no entries file exists, return empty history
    if (!existsSync(entriesPath)) {
      return this.buildHistoryMessage([], consentedActions, conditions);
    }

    // Read raw JSONL and parse cleartext metadata without decryption
    const raw = readFileSync(entriesPath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim());

    const clinicalTypes = new Set<string>([
      'clinical_encounter',
      'clinical_medication',
      'clinical_allergy',
      'clinical_diagnosis',
      'clinical_problem_list',
      'clinical_lab_result',
      'clinical_imaging_result',
      'clinical_pathology',
      'clinical_procedure',
    ]);

    const historySummary: Array<{
      id: string;
      entry_type: string;
      timestamp: string;
      author_type: string;
    }> = [];

    const hasHistoryConsent =
      consentedActions.includes('share_history') ||
      consentedActions.includes('consultation');

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as LedgerEntry;
        if (hasHistoryConsent && clinicalTypes.has(parsed.entry_type)) {
          historySummary.push({
            id: parsed.id,
            entry_type: parsed.entry_type,
            timestamp: parsed.timestamp,
            author_type: parsed.author.type,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    return this.buildHistoryMessage(historySummary, consentedActions, conditions);
  }

  /**
   * Destroy the KeyRing and release key material.
   */
  destroy(): void {
    if (this.keyRing) {
      this.keyRing.destroy();
      this.keyRing = null;
    }
    this.ledgerWriter = null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private ensureInitialized(): { writer: LedgerWriter; keyRing: KeyRing } {
    if (!this.keyRing || !this.ledgerWriter) {
      const vaultJsonPath = join(this.vaultDir, 'vault.json');

      // Create vault if it does not exist
      if (!existsSync(vaultJsonPath)) {
        createVault(this.vaultDir);
      }

      const keyRingPath = join(this.vaultDir, 'keys', 'keyring.json');
      const salt = generateSalt();
      const kwk = deriveMasterKey(this.keyRingPassword, salt, DEFAULT_KDF_PARAMS);

      if (existsSync(keyRingPath)) {
        this.keyRing = KeyRing.load(keyRingPath, kwk);
      } else {
        this.keyRing = KeyRing.create(kwk);
        this.keyRing.save(keyRingPath);
      }

      const entriesPath = join(this.vaultDir, 'ledger', ENTRIES_FILENAME);
      this.ledgerWriter = new LedgerWriter(entriesPath);
    }

    return { writer: this.ledgerWriter!, keyRing: this.keyRing! };
  }

  private buildAuthor(keyRing: KeyRing): EntryAuthor {
    const publicKeyDer = keyRing.getIdentityPublicKeyDer();
    return {
      type: 'patient_agent',
      id: 'patient-agent',
      display_name: 'Patient CareAgent',
      public_key: publicKeyDer.toString('base64'),
    };
  }

  private buildHistoryMessage(
    historySummary: Array<{
      id: string;
      entry_type: string;
      timestamp: string;
      author_type: string;
    }>,
    consentedActions: string[],
    conditions?: string[],
  ): Message {
    return {
      role: 'user',
      parts: [
        {
          type: 'data',
          data: {
            history: historySummary,
            conditions: conditions ?? [],
            consent_scope: consentedActions,
            entry_count: historySummary.length,
          },
          metadata: {
            classification: {
              domain: 'clinical',
              sensitivity: 'sensitive',
            },
          },
        },
      ],
    };
  }
}
