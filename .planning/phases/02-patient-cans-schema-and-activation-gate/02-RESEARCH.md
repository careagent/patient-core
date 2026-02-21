# Phase 2: Patient CANS Schema and Activation Gate - Research

**Researched:** 2026-02-21
**Domain:** TypeBox schema definition, YAML frontmatter parsing, SHA-256 integrity verification, binary activation gate
**Confidence:** HIGH

## Summary

Phase 2 replaces four stub files in `src/activation/` with their full implementations. The technology stack (TypeBox ~0.34.0, YAML via vendor, Node.js `crypto`) is already installed and in use. The patterns to follow are already established in the codebase: the audit entry schema (`src/audit/entry-schema.ts`) demonstrates the TypeBox idiom, `src/vendor/yaml/index.ts` provides the YAML parser, and the hardening layers demonstrate the defensive access pattern against the placeholder CANS schema. Phase 2's job is to replace the placeholder with a real schema and wire up the full activation pipeline.

The key architectural insight from CONTEXT.md is that CANS.md is a **configuration file** (how the agent behaves), not a clinical record. Health data is in the patient chart (a separate Phase 4 concern). PCANS-06 is explicitly redirected: conditions, medications, allergies, and care goals do NOT live in CANS.md. This substantially simplifies the schema compared to the ARCHITECTURE.md's original design sketch.

The activation gate has a clear, proven pipeline: (1) check file presence, (2) parse YAML frontmatter, (3) check `identity_type` discriminator, (4) validate TypeBox schema, (5) verify SHA-256 integrity. Any failure produces `{ active: false, document: null, reason: '...' }`. Success produces `{ active: true, document: CANSDocument, ... }`. The entry points (`src/entry/openclaw.ts`, `src/entry/standalone.ts`) already call `gate.check()` and handle both outcomes — they just need the gate to work.

**Primary recommendation:** Implement in this order: (1) `cans-schema.ts` — define the full TypeBox schema matching CONTEXT.md decisions, (2) `cans-parser.ts` — parse YAML frontmatter using the existing vendor YAML, (3) `cans-integrity.ts` — SHA-256 hash using Node.js `node:crypto`, (4) `gate.ts` — wire the pipeline together. Update vitest.config.ts to un-exclude activation files from coverage and remove entry point exclusions (they become testable once the gate can return `active: true`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CANS.md Schema Shape**
- CANS.md is a **configuration file**, not a clinical record — it tells the agent HOW to behave
- **No health data in CANS.md** — conditions, medications, allergies, care goals all reside in the patient chart (PCANS-06 redirected to chart)
- Contents: identity_type, schema_version, consent posture defaults, communication preferences, advocacy boundaries, provider trust list
- **Core required fields:** identity_type, schema_version, consent_posture, health_literacy_level
- **Optional fields:** trust list, advocacy boundaries (default to safe values if omitted)
- Autonomy tiers are **per-action-type** — each action type (share, request, review) has its own tier: supervised, autonomous, or manual

**Validation Error Behavior**
- Schema validation errors: **summary only** at startup ("CANS.md has 3 validation errors. Run 'patientagent validate' for details.")
- Detailed per-field errors available via a separate `patientagent validate` command
- Integrity (SHA-256) failure: warning + offer to re-sign ("Run 'patientagent resign' to re-validate if you made intentional changes")
- **All validation failures logged to audit trail AND console** — repeated failures could indicate tampering or an attack
- Manual edits to CANS.md are treated **same as tampering** — any modification breaks integrity, patient must use agent commands to update

**Activation Gate Semantics**
- No CANS.md = **silent** standard non-clinical operation — no mention of clinical mode being available
- **Validate once at startup**, cache the activation context for the session (no mid-session re-validation)
- Activation produces a rich context object (consent posture, trust list, preferences) — not just a boolean flag (Claude's discretion)
- Non-patient identity_type: return specific rejection, no provider parsing (Claude's discretion on exact messaging)

**Provider Trust List Design**
- Fields per provider: **NPI, role, trust_level, provider_name, organization, last_changed timestamp**
- Display name and organization included for human-readability without external lookups
- Four trust levels: **pending, active, suspended, revoked** — pending = handshake initiated but patient hasn't confirmed
- last_changed timestamp on each entry for stale trust state detection
- **Empty trust list is valid** — patient can activate clinical mode with zero providers and add them later

### Claude's Discretion
- Exact activation context object shape (rich object vs simple flag — leaning toward parsed ActivationContext)
- Provider CANS.md rejection messaging
- SHA-256 hash storage format and location (inline in CANS.md vs sidecar file)
- TypeBox schema structure (flat vs nested for consent posture sub-fields)

### Deferred Ideas (OUT OF SCOPE)
- **PCANS-06 redirection**: Health context (conditions, medications, allergies, care goals) needs to be modeled in the patient chart, not CANS.md. This affects Phase 4 (Onboarding) which generates the chart alongside CANS.md.
- The `patientagent validate` detailed validation command is a Phase 4 (Onboarding/CLI) concern — Phase 2 provides the validation logic, Phase 4 wires the CLI command.
- The `patientagent resign` re-signing command is similarly a Phase 4 CLI concern — Phase 2 provides the integrity-check-and-resign logic.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PCANS-01 | Patient CANS.md with `identity_type: patient` declares patient identity, consent preferences, provider trust list, advocacy boundaries | TypeBox schema with `identity_type: Type.Literal('patient')` discriminator; required fields: schema_version, consent_posture, health_literacy_level; optional: providers, autonomy, communication, advocacy |
| PCANS-02 | CANS.md presence activates patient clinical mode; absence = standard behavior (binary gate, no partial states) | `fs.promises.readFile` — ENOENT returns `{ active: false, reason: 'no-cans' }` silently; any validation failure also returns inactive; no mid-session re-check |
| PCANS-03 | TypeBox schema validates all CANS.md fields at parse time | `Value.Check(CANSSchema, data)` for boolean check; `[...Value.Errors(CANSSchema, data)]` for collecting errors; both verified working against ~0.34.0 installed in project |
| PCANS-04 | SHA-256 integrity check on every CANS.md load; tampered file triggers warning and does not activate | `node:crypto` `createHash('sha256').update(content, 'utf8').digest('hex')`; Claude's discretion on storage: sidecar `.CANS.md.sha256` file vs inline frontmatter `_integrity` field |
| PCANS-05 | Malformed CANS.md = inactive with clear error message (never partially active) | Gate pipeline: any error short-circuits to `{ active: false, document: null, reason, errors? }`; catch all YAML parse errors and TypeBox validation failures |
| PCANS-06 | **REDIRECTED TO PHASE 4** — health context (conditions, medications, allergies, care goals) moves to patient chart, not CANS.md | No implementation needed in Phase 2; schema has NO health data fields per CONTEXT.md decision |
| PCANS-07 | Provider trust list with NPI, role, and trust_level (active/suspended/revoked/pending) per provider | `Type.Array(TrustListEntrySchema)` with `trust_level: Type.Union([Type.Literal('pending'), Type.Literal('active'), Type.Literal('suspended'), Type.Literal('revoked')])`; `Type.Optional` makes the full providers array optional; empty array is valid |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @sinclair/typebox | ~0.34.0 | Schema definition and validation | Already installed as devDep; used by audit entry schema; `Value.Check`, `Value.Errors`, `Value.Decode` all verified in this project |
| yaml (bundled) | ^2.8.2 | YAML frontmatter parsing | Already vendored at `src/vendor/yaml/index.ts`; bundled by tsdown into dist; `parseYAML(string)` is the import |
| node:crypto | Node.js built-in | SHA-256 hashing | `createHash('sha256').update(content, 'utf8').digest('hex')` — zero deps, stable, already used by Phase 3 audit pipeline pattern |
| node:fs/promises | Node.js built-in | Read CANS.md file | `readFile(path, 'utf8')` — catches ENOENT for absence detection |
| node:path | Node.js built-in | Workspace path resolution | `path.join(workspacePath, 'CANS.md')` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @sinclair/typebox/value | ~0.34.0 | Runtime validation (separate import path) | `import { Value } from '@sinclair/typebox/value'` — needed for `Value.Check` and `Value.Errors` at runtime, separate from `Type` used for schema definition |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @sinclair/typebox/value | Manual validation | TypeBox is already in the stack; custom validation adds maintenance burden and is error-prone for nested schemas |
| Inline `_integrity` frontmatter field | Sidecar `.CANS.md.sha256` file | See Architecture Patterns below — sidecar is simpler and avoids YAML round-trip issues; both approaches were prototyped and work correctly |

**Installation:** No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure

The four activation files all already exist as stubs. Phase 2 replaces stub bodies:

```
src/activation/
├── cans-schema.ts       # TypeBox schema + CANSDocument type + validateCANS()
├── cans-parser.ts       # parseCANS(content) → ParsedFrontmatter
├── cans-integrity.ts    # verifyIntegrity(content, hash) + computeHash(content)
└── gate.ts              # ActivationGate class with check() → ActivationResult

test/unit/activation/   # (new test directory)
├── cans-schema.test.ts
├── cans-parser.test.ts
├── cans-integrity.test.ts
└── gate.test.ts

test/fixtures/cans/     # (new fixture directory)
├── valid-minimal.md    # CANS.md with only required fields, no providers
├── valid-full.md       # CANS.md with all optional fields and providers
├── provider-type.md    # identity_type: provider (discriminator rejection test)
├── missing-fields.md   # Required fields absent (schema validation failure)
└── tampered.md         # Valid YAML/schema but hash won't match (integrity failure)
```

### Pattern 1: TypeBox Schema with Sub-schemas

**What:** Define the full CANS schema as a composition of named sub-schemas. Each logical section gets its own `Type.Object(...)` constant. The top-level `CANSSchema` composes them.

**When to use:** Always — it makes tests easier (test sub-schemas independently), error messages more specific (TypeBox reports path like `/autonomy/share`), and the schema readable.

**Example** (verified working against TypeBox ~0.34.0 installed in this project):

```typescript
// Source: verified prototype against node_modules/@sinclair/typebox ~0.34.0
import { Type, type Static } from '@sinclair/typebox';

// Trust level discriminator union
const TrustLevelSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('active'),
  Type.Literal('suspended'),
  Type.Literal('revoked'),
]);

// Provider trust list entry
const TrustListEntrySchema = Type.Object({
  npi: Type.String({ description: '10-digit NPI identifier' }),
  role: Type.String({ description: 'Clinical role (primary_care, specialist, pharmacist, etc.)' }),
  trust_level: TrustLevelSchema,
  provider_name: Type.String({ description: 'Human-readable display name' }),
  organization: Type.Optional(Type.String()),
  last_changed: Type.String({ description: 'ISO 8601 timestamp of last trust_level change' }),
});

// Autonomy tier for a single action type
const AutonomyTierSchema = Type.Union([
  Type.Literal('supervised'),
  Type.Literal('autonomous'),
  Type.Literal('manual'),
]);

// Per-action-type autonomy configuration
const AutonomySchema = Type.Optional(Type.Object({
  share: AutonomyTierSchema,
  request: AutonomyTierSchema,
  review: AutonomyTierSchema,
}));

// Root CANS schema
export const CANSSchema = Type.Object({
  schema_version: Type.String({ description: 'CANS schema version (e.g. "1.0")' }),
  identity_type: Type.Literal('patient', { description: 'Discriminator: patient vs provider' }),
  consent_posture: Type.Union([
    Type.Literal('deny'),
    Type.Literal('allow'),
  ], { description: 'Default sharing posture' }),
  health_literacy_level: Type.Union([
    Type.Literal('simplified'),
    Type.Literal('standard'),
    Type.Literal('detailed'),
  ], { description: 'Preferred explanation depth' }),
  providers: Type.Optional(Type.Array(TrustListEntrySchema)),
  autonomy: AutonomySchema,
  // communication and advocacy: Claude's discretion on exact shape
  communication: Type.Optional(Type.Object({
    preferred_language: Type.Optional(Type.String()),
    contact_hours: Type.Optional(Type.String()),
  })),
  advocacy: Type.Optional(Type.Object({
    enabled: Type.Optional(Type.Boolean()),
  })),
});

export type CANSDocument = Static<typeof CANSSchema>;
```

Key behaviors verified (all confirmed via prototype):
- `Value.Check(CANSSchema, { schema_version: '1.0', identity_type: 'patient', consent_posture: 'deny', health_literacy_level: 'standard' })` → `true` (minimal valid)
- `Value.Check(CANSSchema, { ...valid, providers: [] })` → `true` (empty providers array is valid)
- `Value.Check(CANSSchema, { ...valid, identity_type: 'provider' })` → `false` (discriminator works)
- `[...Value.Errors(CANSSchema, invalid)]` → `Array<{ path: string, message: string }>` (collectible errors)
- `Value.Check` with a `trust_level: 'invalid'` → `false`

### Pattern 2: YAML Frontmatter Parser

**What:** `parseCANS(content: string): ParsedFrontmatter` extracts the YAML between `---` delimiters, parses it, and returns the object plus the markdown body.

**When to use:** Called by `gate.ts` before schema validation.

**Example** (verified working with bundled yaml 2.8.2):

```typescript
// Source: verified prototype against src/vendor/yaml
import { parseYAML } from '../vendor/yaml/index.js';

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
  error?: string;
}

export function parseCANS(content: string): ParsedFrontmatter {
  const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
  const match = content.match(FRONTMATTER_RE);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  try {
    const parsed = parseYAML(match[1]) as Record<string, unknown>;
    const body = content.slice(match[0].length).trim();
    return { frontmatter: parsed, body };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { frontmatter: null, body: content, error: `YAML parse error: ${message}` };
  }
}
```

Edge cases to handle:
- No frontmatter at all (no `---` delimiters) — return `{ frontmatter: null, body: content }`
- Valid `---` delimiter but invalid YAML inside — catch and return error
- Empty frontmatter `---\n---` — returns `{}` (yaml parses empty string as null, handle defensively)
- CANS.md file exists but is completely empty — treated as no frontmatter

### Pattern 3: SHA-256 Integrity — Sidecar File Approach

**What:** Store the hash of the raw CANS.md file content in a sidecar file `.CANS.md.sha256` in the same directory. On load, read CANS.md, compute SHA-256, compare with sidecar.

**Why sidecar over inline `_integrity` field:** The inline approach requires parsing YAML, stripping the `_integrity` key, reconstructing canonical YAML, then hashing — this is fragile because YAML serialization is not stable (key order, whitespace). The sidecar approach hashes the raw file bytes exactly as stored on disk, which is simpler and deterministic.

**When to use:** Called by `gate.ts` after successful YAML parse, before schema validation.

**Example** (verified with Node.js built-in crypto):

```typescript
// Source: verified prototype against Node.js 22 built-in crypto
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/** Compute SHA-256 of file content as hex string. */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Verify CANS.md integrity against stored hash.
 * Returns true if matching, false if hash missing or mismatched.
 */
export async function verifyIntegrity(
  cansPath: string,
  content: string,
): Promise<{ valid: boolean; stored?: string; computed: string }> {
  const computed = computeHash(content);
  const sidecarPath = join(dirname(cansPath), '.CANS.md.sha256');

  let stored: string;
  try {
    stored = (await readFile(sidecarPath, 'utf8')).trim();
  } catch {
    // Sidecar does not exist -- no integrity on file
    return { valid: false, computed };
  }

  return { valid: stored === computed, stored, computed };
}

/**
 * Write the hash sidecar file. Called when generating/signing CANS.md.
 * Phase 4 CLI uses this; Phase 2 exports the function for Phase 4 to use.
 */
export async function writeIntegritySidecar(
  cansPath: string,
  content: string,
): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  const hash = computeHash(content);
  const sidecarPath = join(dirname(cansPath), '.CANS.md.sha256');
  await writeFile(sidecarPath, hash, 'utf8');
}
```

Note: The existing stub signature is `verifyIntegrity(_content: string, _hash: string): boolean` (synchronous). The full implementation needs the `cansPath` to locate the sidecar, making it async. The gate must be made async accordingly, or the sidecar read must happen in the gate before calling `verifyIntegrity`. The planner should decide: either make `gate.check()` async, or pass the pre-loaded hash into `verifyIntegrity`. **Recommendation: make `gate.check()` async** — the file reads are already async, and forcing synchronous reads would be a worse design.

### Pattern 4: Activation Gate Pipeline

**What:** `ActivationGate.check()` runs the full pipeline and returns `ActivationResult`. The existing interface (`ActivationResult`, `AuditCallback`) is already correct and used by both entry points.

**When to use:** Called once at startup by `register()` (openclaw.ts) and `activate()` (standalone.ts).

**Example** (the actual pipeline logic):

```typescript
// Source: existing gate.ts interface + research
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCANS } from './cans-parser.js';
import { verifyIntegrity } from './cans-integrity.js';
import { CANSSchema, validateCANS } from './cans-schema.js';
import { Value } from '@sinclair/typebox/value';

export async function check(): Promise<ActivationResult> {
  const cansPath = join(this._workspacePath, 'CANS.md');

  // Step 1: Presence check
  let content: string;
  try {
    content = await readFile(cansPath, 'utf8');
  } catch {
    // No CANS.md = silent standard operation (CONTEXT: no mention of clinical mode)
    return { active: false, document: null, reason: 'no-cans' };
  }

  // Step 2: Parse YAML frontmatter
  const { frontmatter, error: parseError } = parseCANS(content);
  if (!frontmatter || parseError) {
    this._auditLog({ action: 'activation_check', outcome: 'error', details: { reason: parseError } });
    return { active: false, document: null, reason: parseError ?? 'invalid-frontmatter' };
  }

  // Step 3: identity_type discriminator check (before full schema validation)
  if (frontmatter.identity_type !== 'patient') {
    const msg = `CANS.md identity_type is '${frontmatter.identity_type}', expected 'patient'`;
    return { active: false, document: null, reason: msg };
  }

  // Step 4: SHA-256 integrity check
  const integrity = await verifyIntegrity(cansPath, content);
  if (!integrity.valid) {
    const msg = 'CANS.md integrity check failed. Run \'patientagent resign\' to re-validate.';
    this._auditLog({ action: 'integrity_check', outcome: 'error', details: { computed: integrity.computed } });
    return { active: false, document: null, reason: msg };
  }

  // Step 5: TypeBox schema validation
  if (!Value.Check(CANSSchema, frontmatter)) {
    const errors = [...Value.Errors(CANSSchema, frontmatter)].map(e => ({
      path: e.path,
      message: e.message,
    }));
    const summary = `CANS.md has ${errors.length} validation error${errors.length === 1 ? '' : 's'}. Run 'patientagent validate' for details.`;
    this._auditLog({ action: 'schema_validation', outcome: 'error', details: { errorCount: errors.length } });
    return { active: false, document: null, reason: summary, errors };
  }

  // All checks pass — activate
  const document = frontmatter as CANSDocument;
  this._auditLog({ action: 'activation_check', outcome: 'active', details: { identity_type: 'patient' } });
  return { active: true, document, reason: 'activated' };
}
```

### Pattern 5: ActivationResult with Rich Context

**What:** The existing `ActivationResult` type already has the right shape. The `document` field is `CANSDocument | null`. The `errors` field carries per-field validation errors (for Phase 4 CLI to display). This is the rich context object pattern from CONTEXT.md.

**Observation:** The hardening layers in Phase 1 access `cans` via defensive casting `(cans as Record<string, unknown>)` with optional chaining. Once Phase 2 implements the real schema, these layers can access typed fields directly. The layer code should be updated to use typed access where it benefits from it (especially `cans-injection.ts` which reads `consent_posture`, trust list, etc. for protocol injection).

### Anti-Patterns to Avoid

- **Synchronous file reads in gate.check():** Using `readFileSync` would block the Node.js event loop. The gate reads CANS.md (potentially large) and the sidecar file. Use `fs.promises.readFile`.
- **Validating on every tool call:** CONTEXT.md decision: validate once at startup, cache. The gate should not be called repeatedly. Entry points call it once and pass the document downstream.
- **Throwing from validateCANS:** Phase 1's stub throws on every call. The real `validateCANS` should return typed data or throw only on validation failure (for use in onboarding/CLI contexts). The gate should use `Value.Check` directly and handle failures without throwing.
- **Including health data fields in CANSSchema:** PCANS-06 is redirected to Phase 4/chart. Do not add conditions, medications, allergies, or care goals to the TypeBox schema. CANS.md is configuration, not clinical data.
- **Hashing after YAML round-trip:** Do not parse YAML then re-serialize for hashing. Hash the raw file content string (as read from disk). This is stable and deterministic.
- **Provider CANS.md attempting full provider-schema validation:** If `identity_type` is not 'patient', stop at the discriminator check. Do not attempt to parse it with any schema.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation with error paths | Custom tree walker | `Value.Check` + `Value.Errors` from @sinclair/typebox/value | TypeBox generates exact JSON Schema path strings; handles nested objects, unions, optionals correctly |
| YAML parsing | Custom YAML parser | `parseYAML` from `src/vendor/yaml/index.ts` | Already bundled, ISC license, handles YAML 1.2 edge cases |
| SHA-256 hash | Custom hash | `crypto.createHash('sha256')` from `node:crypto` | FIPS-compliant, constant-time in Node.js, zero deps |
| UUID generation | Custom random string | `crypto.randomUUID()` | Not needed in Phase 2, but for any future identifiers in the gate |

**Key insight:** The entire Phase 2 implementation needs zero new npm packages. TypeBox, yaml, and node:crypto cover all requirements.

## Common Pitfalls

### Pitfall 1: gate.check() signature change breaking entry points

**What goes wrong:** Making `gate.check()` async requires the entry points to `await gate.check()`. The existing entry points call `gate.check()` synchronously: `const result = gate.check()`. If the return type changes to `Promise<ActivationResult>` without updating the callers, the entry points silently get a Promise object as `result` instead of an `ActivationResult`, and `result.active` is always undefined (falsy), causing silent non-activation.

**Why it happens:** TypeScript catches this only if the caller's return type is checked. If the entry point function is `void`, TypeScript may not complain about discarding the Promise.

**How to avoid:** Make `gate.check()` async, update both `src/entry/openclaw.ts` and `src/entry/standalone.ts` to use `await gate.check()`, and make the surrounding functions async or use `.then()`. The `register()` function in openclaw.ts becomes `async function register(api: unknown): Promise<void>`. Update tests accordingly.

**Warning signs:** Gate returns `inactive` in all tests even with a valid fixture CANS.md.

### Pitfall 2: vitest.config.ts coverage exclusions not updated

**What goes wrong:** Phase 1 excluded all activation files from coverage:
```
'src/activation/cans-schema.ts',
'src/activation/cans-parser.ts',
'src/activation/cans-integrity.ts',
```
Phase 2 implements these files. If the exclusions remain, coverage does not measure the new code.

**Why it happens:** vitest.config.ts exclusions are additive. New implemented files not removed from the exclude list report 0% coverage but don't fail thresholds.

**How to avoid:** Phase 2 must remove all four activation files from `vitest.config.ts` coverage.exclude. Also remove entry point exclusions (`src/entry/openclaw.ts`, `src/entry/standalone.ts`, `src/entry/core.ts`) — these were excluded because the `active` branch was structurally unreachable until the gate always returned inactive. Once the gate works, those branches become testable.

**Warning signs:** Coverage report shows no coverage data for `src/activation/` files after implementing them.

### Pitfall 3: Empty frontmatter edge case

**What goes wrong:** YAML parses `---\n---` (empty frontmatter) as `null`, not `{}`. If `parseCANS` returns `{ frontmatter: null }` for empty frontmatter, the gate treats it like a missing CANS.md instead of a malformed one.

**Why it happens:** The yaml library's `parse('')` returns `null`. The regex match succeeds (the `---\n---` pattern matches), but the parsed content is null.

**How to avoid:** In `parseCANS`, after parsing: `if (parsed === null || typeof parsed !== 'object') return { frontmatter: null, error: 'frontmatter is empty or not an object' }`.

**Warning signs:** A CANS.md with empty `---\n---` returns `{ active: false, reason: 'no-cans' }` instead of `{ active: false, reason: 'invalid-frontmatter' }`.

### Pitfall 4: Integrity check ordering (validate before or after integrity?)

**What goes wrong:** If schema validation happens before integrity check, a tampered CANS.md that still happens to be schema-valid will activate (briefly) before the integrity check fails. The CONTEXT.md decision is clear: integrity check is a separate concern from schema validation, both must fail-fast.

**How to avoid:** The gate pipeline ORDER matters: (1) presence, (2) parse YAML, (3) discriminator, (4) **integrity check**, (5) schema validation. Integrity runs before TypeBox schema validation. This matches the success criteria: "A CANS.md with a modified byte fails SHA-256 integrity check" — it fails regardless of whether the schema is still valid.

**Warning signs:** A tampered-but-schema-valid CANS.md activates clinical mode.

### Pitfall 5: Sidecar file absence vs. integrity mismatch (different semantics)

**What goes wrong:** There are two different failure modes for the integrity check: (a) no sidecar file exists yet (CANS.md was never signed), (b) sidecar exists but hash does not match (tampering). Treating both as identical returns confusing error messages and makes it impossible for the CLI to suggest the right remediation.

**How to avoid:** `verifyIntegrity` should return a result with a `reason` field distinguishing the two cases:
```typescript
export type IntegrityResult =
  | { valid: true }
  | { valid: false; reason: 'no-sidecar' }
  | { valid: false; reason: 'hash-mismatch'; stored: string; computed: string };
```
The gate uses the reason to produce appropriate messages: "CANS.md has never been signed" vs. "CANS.md has been modified since last signing."

**Warning signs:** A fresh CANS.md with no sidecar gets the same error message as a tampered CANS.md.

### Pitfall 6: TypeBox `@sinclair/typebox/value` import path in ESM

**What goes wrong:** TypeBox has two import paths: `@sinclair/typebox` for type definitions (`Type`, `Static`) and `@sinclair/typebox/value` for runtime operations (`Value`). The ESM build resolves these differently. Using `import { Value } from '@sinclair/typebox'` fails at runtime because Value is not exported from the main entry.

**How to avoid:** Always use `import { Value } from '@sinclair/typebox/value'` for `Value.Check`, `Value.Errors`, `Value.Decode`. This is confirmed by inspecting `node_modules/@sinclair/typebox/package.json` exports map. TypeScript types are `import { Type, type Static } from '@sinclair/typebox'`.

**Warning signs:** Runtime error: `Value is not exported from '@sinclair/typebox'`.

## Code Examples

Verified patterns from the installed project:

### TypeBox Value.Errors for error collection

```typescript
// Source: verified prototype against installed @sinclair/typebox ~0.34.0
import { Value } from '@sinclair/typebox/value';
import { CANSSchema } from './cans-schema.js';

function getValidationErrors(data: unknown): Array<{ path: string; message: string }> {
  return [...Value.Errors(CANSSchema, data)].map(e => ({
    path: e.path,
    message: e.message,
  }));
}

// Example error output for missing required field:
// [{ path: '/health_literacy_level', message: 'Expected required property' }]

// Example error output for wrong literal:
// [{ path: '/identity_type', message: "Expected 'patient'" }]

// Count for summary message:
const summary = `CANS.md has ${errors.length} validation error${errors.length === 1 ? '' : 's'}.`;
```

### SHA-256 hash of raw file content

```typescript
// Source: verified prototype against Node.js 22 built-in crypto
import { createHash } from 'node:crypto';

function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
// Returns 64-character lowercase hex string
// Example: 'a3f5b2c1...' (64 chars)
```

### YAML frontmatter extraction

```typescript
// Source: verified prototype against bundled yaml 2.8.2
import { parseYAML } from '../vendor/yaml/index.js';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;
  const parsed = parseYAML(match[1]);
  if (parsed === null || typeof parsed !== 'object') return null;
  return parsed as Record<string, unknown>;
}
```

### Fixture CANS.md for testing

```yaml
---
schema_version: "1.0"
identity_type: patient
consent_posture: deny
health_literacy_level: standard
providers:
  - npi: "1234567890"
    role: primary_care
    trust_level: active
    provider_name: "Dr. Jane Smith"
    organization: "City Medical Group"
    last_changed: "2026-01-15T09:00:00Z"
autonomy:
  share: supervised
  request: supervised
  review: autonomous
---

# Patient CANS

Clinical Agent Navigation System — patient configuration for the CareAgent.
```

### Fixture CANS.md — minimal valid (required fields only)

```yaml
---
schema_version: "1.0"
identity_type: patient
consent_posture: deny
health_literacy_level: standard
---

# Patient CANS
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `validateCANS` stub throws | `Value.Check` + `Value.Errors` with error collection | Phase 2 | Gate can now activate; hardening layers get real typed CANSDocument |
| `gate.check()` always returns inactive | Full pipeline: presence → parse → discriminator → integrity → schema | Phase 2 | Entry point active branches become reachable; coverage exclusions lift |
| `ActivationResult.document` always null | Real `CANSDocument` passed to hardening engine | Phase 2 | Hardening layers can remove defensive casting; cans-injection injects real consent posture |
| Hardening layers use `(cans as Record)` with optional chaining | Can use typed `cans.consent_posture`, `cans.providers` etc. | Phase 2 | Layers become type-safe; cans-injection produces richer protocol rules |

**Deprecated/outdated after Phase 2:**
- `throw new Error('CANS schema validation not yet implemented (Phase 2)')` in cans-schema.ts
- `throw new Error('CANS parser not yet implemented (Phase 2)')` in cans-parser.ts
- `throw new Error('CANS integrity verification not yet implemented (Phase 2)')` in cans-integrity.ts
- `return { active: false, document: null, reason: 'CANS schema not yet implemented (Phase 2)' }` in gate.ts

## Open Questions

1. **Async gate.check() — how to update entry points cleanly**
   - What we know: Both `src/entry/openclaw.ts` and `src/entry/standalone.ts` call `gate.check()` synchronously. Making it async requires changing both callers.
   - What's unclear: Whether `register(api)` in openclaw.ts can be made async without OpenClaw rejecting an async plugin registration function.
   - Recommendation: Check OpenClaw's plugin API contract. If `register()` cannot be async, use `gate.check()` as a sync function that uses sync file reads internally (`readFileSync`) — which is acceptable given CANS.md is small (~2KB) and reads only at startup. Alternatively, pre-load the CANS.md content in the constructor and call `check()` with the pre-loaded content as a parameter. The planner should resolve this during task design.

2. **Sidecar file naming convention**
   - What we know: CONTEXT.md leaves hash storage format/location as Claude's discretion.
   - What's unclear: Whether `.CANS.md.sha256` (hidden file) or `CANS.md.sha256` (visible) is better UX.
   - Recommendation: Use `.CANS.md.sha256` (hidden file, prefixed with dot). This is consistent with `.gitignore` and other hidden configuration artifacts. Patients should not need to interact with it directly.

3. **validateCANS() function signature post-implementation**
   - What we know: The stub has `export function validateCANS(_data: unknown): CANSDocument` (throws always). Phase 4 CLI needs a function to call for the `patientagent validate` detailed output.
   - What's unclear: Should `validateCANS` throw on failure (for CLI use where an error message is desired) or return a result object?
   - Recommendation: Keep `validateCANS` as a function that throws on failure with a descriptive error — this is natural for CLI use. The gate uses `Value.Check`/`Value.Errors` directly (doesn't need to throw). Phase 4 calls `validateCANS` in the CLI command handler where catch gives the message.

4. **cans-injection.ts typed field access after Phase 2**
   - What we know: `src/hardening/layers/cans-injection.ts` currently accesses CANS fields via `(cans as Record<string, unknown>)` and optional chaining. Once Phase 2 defines the real schema, this becomes unnecessary.
   - What's unclear: How much of `extractProtocolRules` should be updated vs. deferred.
   - Recommendation: Update `extractProtocolRules` in Phase 2 to use typed access for `identity_type`, `consent_posture`, `providers` (trust list summary), and `autonomy` tiers. This makes the clinical protocol injection meaningful and tests the schema's real shape. This is a direct deliverable of Phase 2, not a separate concern.

## Sources

### Primary (HIGH confidence)

- Project source code analysis — verified by reading all 4 activation stubs, entry points, hardening engine, audit schema, and vitest config. Direct code inspection, no inference.
- TypeBox prototype tests — verified `Value.Check`, `Value.Errors`, `Value.Decode`, Optional fields, Union types, Literal discriminators against installed `@sinclair/typebox ~0.34.48` in this project's node_modules.
- YAML frontmatter prototype — verified `parseYAML` from bundled yaml 2.8.2 against test CANS.md content. Confirmed empty frontmatter edge case.
- SHA-256 prototype — verified `createHash('sha256').update(content, 'utf8').digest('hex')` against Node.js 22.22.0 (installed runtime). Confirmed sidecar hash approach.
- `/Users/medomatic/Documents/Projects/patient-core/.planning/phases/02-patient-cans-schema-and-activation-gate/02-CONTEXT.md` — User decisions, locked constraints, deferred items.
- `/Users/medomatic/Documents/Projects/patient-core/.planning/REQUIREMENTS.md` — PCANS-01 through PCANS-07 requirements.
- `/Users/medomatic/Documents/Projects/patient-core/.planning/STATE.md` — Project state, accumulated decisions.
- `/Users/medomatic/Documents/Projects/patient-core/.planning/research/ARCHITECTURE.md` — Phase 2 design patterns, TypeBox schema sketch (note: schema content overridden by CONTEXT.md decisions — no health data in CANS).
- `/Users/medomatic/Documents/Projects/patient-core/.planning/research/STACK.md` — TypeBox, yaml, node:crypto stack decisions verified.
- `/Users/medomatic/Documents/Projects/patient-core/.planning/research/PITFALLS.md` — Pitfall 13 (integrity check blocking) and Pitfall 15 (stale trust states) are Phase 2 relevant.

### Secondary (MEDIUM confidence)

- `.planning/phases/01-plugin-scaffolding-and-platform-portability/01-02-SUMMARY.md` — Phase 1 outcomes, what's stubbed and why, coverage exclusion decisions.

### Tertiary (LOW confidence)

- None for this phase — all findings are verified directly against installed project code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, APIs directly tested in project node_modules
- Architecture: HIGH — four activation stubs are the direct replacement targets; interfaces with entry points are explicit in code
- Pitfalls: HIGH — identified from direct code reading (async gate risk, vitest coverage exclusions, TypeBox import paths)
- Schema design: HIGH — verified TypeBox ~0.34.0 behavior; CONTEXT.md constraints are unambiguous
- Integrity approach: HIGH — sidecar approach prototyped and verified; tradeoffs documented

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable stack, no external moving parts)
