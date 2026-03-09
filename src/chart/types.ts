/**
 * Patient chart vault client — bridges patient-core with @careagent/patient-chart.
 *
 * Wraps patient-chart's LedgerWriter, ChartReader, and KeyRing into a single
 * client that patient-core modules (messaging pipeline, discovery handshake,
 * onboarding bot) use for all vault operations.
 *
 * All writes go through LedgerWriter (signed, encrypted, hash-chained).
 * All reads go through ChartReader (ACL-enforced, decrypted, paginated).
 */

import type { KeyObject } from 'node:crypto';
import type {
  LedgerEntry,
  LedgerEntryType,
  EntryAuthor,
  ChartQueryParams,
  ChartQueryResult,
  ChartEntryResult,
  ChartIntegrityResult,
} from '@careagent/patient-chart';
import {
  LedgerWriter,
  createChartReader,
  KeyRing,
} from '@careagent/patient-chart';
import type { ChartReader } from '@careagent/patient-chart';

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface PatientChartClientConfig {
  /** Absolute path to the vault root directory. */
  vaultPath: string;
  /** The loaded KeyRing instance (manages encryption keys + Ed25519 identity). */
  keyRing: KeyRing;
  /** Patient agent display name (used in EntryAuthor). */
  displayName: string;
  /** Patient agent ID (used in EntryAuthor and ACL requester_id). */
  agentId: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * PatientChartClient — the concrete integration between patient-core and
 * the patient-chart encrypted vault.
 *
 * Provides:
 * - `writeEntry()` — append a signed, encrypted entry to the ledger
 * - `query()` — ACL-enforced queries with filtering and pagination
 * - `getEntry()` — ACL-enforced single entry lookup
 * - `verifyIntegrity()` — hash chain and signature verification
 *
 * All operations use the patient's Ed25519 identity from the KeyRing
 * for signing entries and the patient's agent ID for ACL enforcement.
 */
export class PatientChartClient {
  private readonly writer: LedgerWriter;
  private readonly reader: ChartReader;
  private readonly keyRing: KeyRing;
  private readonly author: EntryAuthor;
  private readonly agentId: string;

  constructor(config: PatientChartClientConfig) {
    const { vaultPath, keyRing, displayName, agentId } = config;
    const entriesPath = `${vaultPath}/ledger/entries.jsonl`;

    this.keyRing = keyRing;
    this.agentId = agentId;

    this.author = {
      type: 'patient_agent',
      id: agentId,
      display_name: displayName,
      public_key: keyRing.getIdentityPublicKeyDer().toString('base64'),
    };

    this.writer = new LedgerWriter(entriesPath);

    this.reader = createChartReader({
      vaultPath,
      getActiveKey: () => keyRing.getActiveEncryptionKey(),
      getKeyById: (keyId: string) => keyRing.getEncryptionKey(keyId),
    });
  }

  /**
   * Write a new entry to the ledger.
   *
   * The entry is signed with the patient's Ed25519 private key,
   * encrypted with the active AES-256-GCM key, and hash-chained
   * to the previous entry.
   */
  writeEntry(
    content: unknown,
    entryType: LedgerEntryType,
    opts?: { amends?: string },
  ): LedgerEntry {
    return this.writer.writeEntry(
      content,
      entryType,
      this.author,
      () => this.keyRing.getActiveEncryptionKey(),
      this.keyRing.getIdentityPrivateKey(),
      opts,
    );
  }

  /**
   * Query the ledger with ACL enforcement.
   *
   * Uses this patient's agent ID as the requester for ACL checks.
   */
  query(params: Omit<ChartQueryParams, 'requester_id'>): ChartQueryResult {
    return this.reader.query({
      ...params,
      requester_id: this.agentId,
    });
  }

  /**
   * Get a single entry by ID with ACL enforcement.
   */
  getEntry(entryId: string): ChartEntryResult | null {
    return this.reader.getEntry(this.agentId, entryId);
  }

  /**
   * Verify ledger integrity (hash chain + optionally signatures).
   */
  verifyIntegrity(opts?: { full?: boolean }): ChartIntegrityResult {
    return this.reader.verifyIntegrity(opts);
  }

  /**
   * Get the patient's EntryAuthor identity (for external consumers).
   */
  getAuthor(): EntryAuthor {
    return this.author;
  }

  /**
   * Get the Ed25519 signing key (for external consumers that need
   * to sign payloads directly, e.g., messaging acks).
   */
  getSigningKey(): KeyObject {
    return this.keyRing.getIdentityPrivateKey();
  }
}

// Re-export patient-chart types needed by consumers
export type {
  LedgerEntry,
  LedgerEntryType,
  EntryAuthor,
  ChartQueryParams,
  ChartQueryResult,
  ChartEntryResult,
  ChartIntegrityResult,
} from '@careagent/patient-chart';
