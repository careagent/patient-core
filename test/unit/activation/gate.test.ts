/**
 * TDD tests for ActivationGate.check() pipeline.
 *
 * Pipeline steps (in order, short-circuits on first failure):
 * 1. Presence check: fs.readFile(cansPath) -- ENOENT = { active: false, reason: 'no-cans' }
 * 2. YAML parse: parseCANS(content) -- parse error = { active: false, reason: parseError }
 * 3. identity_type discriminator: not 'patient' = specific rejection
 * 4. SHA-256 integrity: verifyIntegrity -- no-sidecar or hash-mismatch = inactive
 * 5. TypeBox schema: Value.Check -- fails = { active: false, errors: [...] }
 * 6. All pass: { active: true, document: CANSDocument }
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ActivationGate, type AuditCallback } from '../../../src/activation/gate.js';
import { computeHash, writeIntegritySidecar } from '../../../src/activation/cans-integrity.js';

// Helper: create a temp workspace directory
async function createTempWorkspace(): Promise<string> {
  const dir = join(tmpdir(), `gate-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// Helper: write a CANS.md file and optional sidecar into workspace
async function writeCansFile(
  workspacePath: string,
  content: string,
  options?: { withSidecar?: boolean; sidecarHash?: string },
): Promise<string> {
  const cansPath = join(workspacePath, 'CANS.md');
  await writeFile(cansPath, content, 'utf8');

  if (options?.withSidecar) {
    const hash = options.sidecarHash ?? computeHash(content);
    await writeFile(join(workspacePath, '.CANS.md.sha256'), hash, 'utf8');
  }

  return cansPath;
}

// Load fixture content from test/fixtures/cans/
const FIXTURES_DIR = join(import.meta.dirname!, '..', '..', 'fixtures', 'cans');

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), 'utf8');
}

describe('ActivationGate.check()', () => {
  let workspacePath: string;
  let auditLog: AuditCallback;
  let auditEntries: Array<Record<string, unknown>>;

  beforeEach(async () => {
    workspacePath = await createTempWorkspace();
    auditEntries = [];
    auditLog = vi.fn((entry: Record<string, unknown>) => {
      auditEntries.push(entry);
    });
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Step 1: Presence check
  // -------------------------------------------------------------------------
  describe('Step 1: Presence check', () => {
    it('returns { active: false, reason: "no-cans" } when CANS.md is absent', async () => {
      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      expect(result.reason).toBe('no-cans');
      expect(result.document).toBeNull();
      // Silent case: no audit log for absent CANS.md
      expect(auditLog).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Step 2: YAML parse
  // -------------------------------------------------------------------------
  describe('Step 2: YAML parse', () => {
    it('returns { active: false } with parse error for invalid YAML', async () => {
      const invalidYaml = '---\n[invalid: yaml: content:\n---\n# Body\n';
      await writeCansFile(workspacePath, invalidYaml);

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      expect(result.document).toBeNull();
      expect(result.reason).toContain('YAML parse error');
    });

    it('returns { active: false } when frontmatter is empty', async () => {
      const emptyFrontmatter = '---\n---\n# Body\n';
      await writeCansFile(workspacePath, emptyFrontmatter);

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      expect(result.document).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it('returns { active: false } when no frontmatter delimiters', async () => {
      const noDelimiters = '# Just a markdown file\n\nNo frontmatter here.\n';
      await writeCansFile(workspacePath, noDelimiters);

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      expect(result.document).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Step 3: identity_type discriminator
  // -------------------------------------------------------------------------
  describe('Step 3: identity_type discriminator', () => {
    it('returns { active: false } with specific message for identity_type: provider', async () => {
      const providerContent = await loadFixture('provider-type.md');
      await writeCansFile(workspacePath, providerContent, { withSidecar: true });

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      expect(result.document).toBeNull();
      expect(result.reason).toContain('provider');
      expect(result.reason).toContain('patient');
    });
  });

  // -------------------------------------------------------------------------
  // Step 4: SHA-256 integrity
  // -------------------------------------------------------------------------
  describe('Step 4: SHA-256 integrity', () => {
    it('returns { active: false } when no sidecar file exists (never signed)', async () => {
      const content = await loadFixture('valid-minimal.md');
      await writeCansFile(workspacePath, content); // no sidecar

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      expect(result.document).toBeNull();
      expect(result.reason).toContain('never been signed');
    });

    it('returns { active: false } when sidecar hash mismatches (tampering)', async () => {
      const content = await loadFixture('valid-minimal.md');
      await writeCansFile(workspacePath, content, {
        withSidecar: true,
        sidecarHash: 'deadbeef0000000000000000000000000000000000000000000000000000dead',
      });

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      expect(result.document).toBeNull();
      expect(result.reason).toContain('patientagent resign');
    });

    it('integrity check runs BEFORE schema validation (tampered-but-schema-valid)', async () => {
      // A valid-minimal CANS.md with a wrong sidecar hash -- schema is valid but
      // integrity fails. Must return inactive due to integrity, not schema.
      const content = await loadFixture('valid-minimal.md');
      await writeCansFile(workspacePath, content, {
        withSidecar: true,
        sidecarHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      // Must be integrity failure, NOT schema failure
      expect(result.reason).not.toContain('validation error');
      expect(result.reason).toContain('patientagent resign');
      expect(result.errors).toBeUndefined();
    });

    it('audits integrity failure with computed hash', async () => {
      const content = await loadFixture('valid-minimal.md');
      await writeCansFile(workspacePath, content, {
        withSidecar: true,
        sidecarHash: 'deadbeef0000000000000000000000000000000000000000000000000000dead',
      });

      const gate = new ActivationGate(workspacePath, auditLog);
      await gate.check();

      expect(auditLog).toHaveBeenCalled();
      const integrityAudit = auditEntries.find(
        (e) => e.action === 'integrity_check' || (e.details as Record<string, unknown>)?.computed,
      );
      expect(integrityAudit).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Step 5: TypeBox schema validation
  // -------------------------------------------------------------------------
  describe('Step 5: Schema validation', () => {
    it('returns { active: false, errors: [...] } for missing required fields', async () => {
      const content = await loadFixture('missing-fields.md');
      // Need a valid sidecar so integrity passes
      await writeCansFile(workspacePath, content, { withSidecar: true });

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(false);
      expect(result.document).toBeNull();
      expect(result.reason).toContain('validation error');
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThanOrEqual(2);
    });

    it('audits schema validation failure with error count', async () => {
      const content = await loadFixture('missing-fields.md');
      await writeCansFile(workspacePath, content, { withSidecar: true });

      const gate = new ActivationGate(workspacePath, auditLog);
      await gate.check();

      expect(auditLog).toHaveBeenCalled();
      const schemaAudit = auditEntries.find(
        (e) =>
          e.action === 'schema_validation' ||
          (e.details as Record<string, unknown>)?.errorCount !== undefined,
      );
      expect(schemaAudit).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Step 6: All pass -- activation
  // -------------------------------------------------------------------------
  describe('Step 6: Successful activation', () => {
    it('returns { active: true, document } for valid minimal CANS.md with sidecar', async () => {
      const content = await loadFixture('valid-minimal.md');
      await writeCansFile(workspacePath, content, { withSidecar: true });

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(true);
      expect(result.document).not.toBeNull();
      expect(result.document!.schema_version).toBe('1.0');
      expect(result.document!.identity_type).toBe('patient');
      expect(result.document!.consent_posture).toBe('deny');
      expect(result.document!.health_literacy_level).toBe('standard');
      expect(result.reason).toBe('activated');
    });

    it('returns { active: true, document } for valid full CANS.md with sidecar', async () => {
      const content = await loadFixture('valid-full.md');
      await writeCansFile(workspacePath, content, { withSidecar: true });

      const gate = new ActivationGate(workspacePath, auditLog);
      const result = await gate.check();

      expect(result.active).toBe(true);
      expect(result.document).not.toBeNull();
      expect(result.document!.providers).toBeDefined();
      expect(result.document!.providers!.length).toBe(1);
      expect(result.document!.providers![0].npi).toBe('1234567890');
      expect(result.document!.providers![0].trust_level).toBe('active');
      expect(result.document!.autonomy).toBeDefined();
      expect(result.document!.autonomy!.share).toBe('supervised');
      expect(result.document!.autonomy!.review).toBe('autonomous');
    });

    it('audits successful activation with identity_type', async () => {
      const content = await loadFixture('valid-minimal.md');
      await writeCansFile(workspacePath, content, { withSidecar: true });

      const gate = new ActivationGate(workspacePath, auditLog);
      await gate.check();

      expect(auditLog).toHaveBeenCalled();
      const activationAudit = auditEntries.find(
        (e) =>
          (e.details as Record<string, unknown>)?.identity_type === 'patient',
      );
      expect(activationAudit).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Audit callback safety
  // -------------------------------------------------------------------------
  describe('Audit callback safety', () => {
    it('does not throw if audit callback throws', async () => {
      const throwingAudit: AuditCallback = () => {
        throw new Error('Audit pipeline is a stub');
      };

      const content = await loadFixture('valid-minimal.md');
      await writeCansFile(workspacePath, content, { withSidecar: true });

      const gate = new ActivationGate(workspacePath, throwingAudit);
      // Should not throw -- audit errors are swallowed
      const result = await gate.check();
      expect(result.active).toBe(true);
    });

    it('does not audit the silent no-cans case', async () => {
      const gate = new ActivationGate(workspacePath, auditLog);
      await gate.check();

      expect(auditLog).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // gate.check() is async
  // -------------------------------------------------------------------------
  describe('Async contract', () => {
    it('gate.check() returns a Promise', () => {
      const gate = new ActivationGate(workspacePath, auditLog);
      const result = gate.check();
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
