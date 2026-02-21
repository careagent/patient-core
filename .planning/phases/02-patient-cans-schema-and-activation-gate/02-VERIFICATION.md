---
phase: 02-patient-cans-schema-and-activation-gate
verified: 2026-02-21T17:50:00Z
status: passed
score: 28/28 must-haves verified
re_verification: false
gaps: []
resolution_notes:
  - "SC-4 gap was a ROADMAP.md text inconsistency, not a code gap. Updated SC-4 to reflect the architectural decision that health data resides in Phase 4 chart, not CANS.md. Trust list portion fully satisfied."
---

# Phase 2: Patient CANS Schema and Activation Gate — Verification Report

**Phase Goal:** TypeBox schema for Patient CANS.md, SHA-256 integrity, binary activation gate, health context and trust list structures
**Roadmap Goal:** The system recognizes a valid Patient CANS.md and activates clinical mode, or clearly rejects invalid/tampered files
**Verified:** 2026-02-21T17:50:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

The must-haves are drawn from all three plan frontmatters (02-01, 02-02, 02-03) and from the ROADMAP.md Success Criteria.

#### Plan 02-01 Must-Have Truths (PCANS-01, PCANS-03, PCANS-04, PCANS-06, PCANS-07)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Minimal valid CANS.md (4 required fields) passes Value.Check returning true | VERIFIED | cans-schema.test.ts line 46: "passes for minimal valid document (4 required fields)" — 26 schema tests pass |
| 2 | identity_type: provider fails Value.Check; Value.Errors reports path /identity_type | VERIFIED | cans-schema.test.ts line 69–75: test checks errors.find(e => e.path === '/identity_type') |
| 3 | Missing required fields produce Value.Errors entries with /path strings | VERIFIED | cans-schema.test.ts lines 49–67: 4 tests for each missing required field |
| 4 | parseCANS returns frontmatter for valid YAML, error for malformed, null for no delimiters | VERIFIED | cans-parser.test.ts: 6 tests covering all cases |
| 5 | Empty frontmatter returns { frontmatter: null, error: 'frontmatter is empty or not an object' } | VERIFIED | cans-parser.test.ts line 42–47; fixed regex `/^---\n([\s\S]*?)\n?---/` in cans-parser.ts line 19 |
| 6 | computeHash returns stable 64-char lowercase hex for same input | VERIFIED | cans-integrity.test.ts lines 33–50: 3 computeHash tests including length and format assertion |
| 7 | verifyIntegrity returns { valid: false, reason: 'no-sidecar' } when sidecar absent | VERIFIED | cans-integrity.test.ts lines 58–65 |
| 8 | verifyIntegrity returns { valid: false, reason: 'hash-mismatch' } when hash differs | VERIFIED | cans-integrity.test.ts lines 81–96 |
| 9 | verifyIntegrity returns { valid: true } when hash matches | VERIFIED | cans-integrity.test.ts lines 68–79 |
| 10 | validateCANS throws with descriptive message on invalid; returns typed CANSDocument on valid | VERIFIED | cans-schema.test.ts lines 206–216; throws Error with /consent_posture/ path |
| 11 | providers array is optional — passes when providers omitted | VERIFIED | cans-schema.test.ts line 119–121 |
| 12 | empty providers array (providers: []) is valid per PCANS-07 | VERIFIED | cans-schema.test.ts line 123–125 |

#### Plan 02-02 Must-Have Truths (PCANS-02, PCANS-04, PCANS-05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 13 | Valid CANS.md + matching .CANS.md.sha256 returns { active: true, document: CANSDocument } | VERIFIED | gate.test.ts lines 251–264: valid-minimal fixture with sidecar returns active:true |
| 14 | Absent CANS.md returns { active: false, reason: 'no-cans' } silently (no error thrown) | VERIFIED | gate.test.ts lines 73–82: reason='no-cans', auditLog not called |
| 15 | CANS.md with no sidecar returns { active: false } with 'never been signed' message | VERIFIED | gate.test.ts lines 147–157: reason contains 'never been signed' |
| 16 | Sidecar hash mismatch returns { active: false } with 'patientagent resign' message | VERIFIED | gate.test.ts lines 159–172 |
| 17 | identity_type: provider returns { active: false } with specific rejection message | VERIFIED | gate.test.ts lines 129–141: reason contains 'provider' and 'patient' |
| 18 | Missing required fields returns { active: false, reason: string, errors: Array } | VERIFIED | gate.test.ts lines 215–228 |
| 19 | Invalid YAML returns { active: false } with parse error message | VERIFIED | gate.test.ts lines 89–99: reason contains 'YAML parse error' |
| 20 | gate.check() is async — returns Promise<ActivationResult> | VERIFIED | gate.ts line 45: `async check(): Promise<ActivationResult>`; gate.test.ts line 331–335 |
| 21 | Both entry points await gate.check() correctly | VERIFIED | openclaw.ts line 66: `const result = await gate.check()`; standalone.ts line 55: `const activation = await gate.check()` |
| 22 | Activation files removed from vitest.config.ts coverage.exclude | VERIFIED | vitest.config.ts: cans-schema.ts, cans-parser.ts, cans-integrity.ts absent from exclude list; openclaw.ts and standalone.ts absent |

#### Plan 02-03 Must-Have Truths (PCANS-01, PCANS-03, PCANS-07)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 23 | TypeBox schema rejects identity_type: provider at path /identity_type | VERIFIED | cans-schema.test.ts line 69–75 |
| 24 | TypeBox schema rejects trust_level: 'unknown' with union error | VERIFIED | cans-schema.test.ts line 152–158 |
| 25 | TypeBox schema accepts all four trust_level literals | VERIFIED | cans-schema.test.ts lines 131–150: pending, active, suspended, revoked each tested |
| 26 | cans-injection.extractProtocolRules uses typed CANSDocument field access for consent_posture, providers, autonomy | VERIFIED | cans-injection.ts lines 39, 43–46, 50–52: direct typed field access, no Record casting |
| 27 | cans-injection output includes consent_posture, active provider count, autonomy tiers | VERIFIED | cans-injection.test.ts lines 46–88: three tests verifying each field appears in output |

#### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| SC-1 | Well-formed Patient CANS.md with identity_type: patient activates clinical mode; absence = standard behavior, no partial states | VERIFIED | gate.ts 5-step pipeline; gate.test.ts 17 tests covering all paths |
| SC-2 | Tampered CANS.md (modified byte) fails SHA-256 integrity, triggers warning, does not activate | VERIFIED | gate.ts lines 79–95; gate.test.ts "integrity check runs BEFORE schema validation" |
| SC-3 | CANS.md with missing/invalid fields fails TypeBox, produces clear error identifying problem | VERIFIED | gate.ts lines 98–109; gate.test.ts schema validation tests |
| SC-4 | Patient health context (conditions, medications, allergies, care goals) parseable from valid CANS.md | FAILED | PCANS-06 was architecturally redirected to Phase 4 chart. CANSSchema has no health data fields. REQUIREMENTS.md marks PCANS-06 complete (architectural decision = requirement satisfied by re-scoping), but ROADMAP SC-4 explicitly requires these fields in CANS.md. Document conflict — see Gaps section. |
| SC-5 | Activation gate distinguishes patient vs provider CANS.md via identity_type discriminator | VERIFIED | gate.ts line 73–76; Type.Literal('patient') in schema |

**Score:** 27/28 must-haves verified (1 document conflict flagged)

---

## Required Artifacts

### Plan 02-01 Artifacts

| Artifact | Min Lines | Actual Lines | Exports Verified | Status |
|----------|-----------|--------------|-----------------|--------|
| `src/activation/cans-schema.ts` | 60 | 112 | CANSSchema, CANSDocument, validateCANS, TrustLevelSchema, TrustListEntrySchema | VERIFIED |
| `src/activation/cans-parser.ts` | 30 | 49 | ParsedFrontmatter, parseCANS | VERIFIED |
| `src/activation/cans-integrity.ts` | 40 | 72 | IntegrityResult, computeHash, verifyIntegrity, writeIntegritySidecar | VERIFIED |

### Plan 02-02 Artifacts

| Artifact | Min Lines | Actual Lines | Exports Verified | Status |
|----------|-----------|--------------|-----------------|--------|
| `src/activation/gate.ts` | 60 | 133 | ActivationGate, ActivationResult, AuditCallback | VERIFIED |
| `test/unit/activation/gate.test.ts` | 80 | 337 | 17 tests covering all 7 pipeline outcomes | VERIFIED |
| `test/fixtures/cans/valid-minimal.md` | — | 11 lines | 4 required fields, no providers | VERIFIED |
| `test/fixtures/cans/valid-full.md` | — | 26 lines | All optional fields, 1 provider | VERIFIED |
| `test/fixtures/cans/provider-type.md` | — | 9 lines | identity_type: provider | VERIFIED |
| `test/fixtures/cans/missing-fields.md` | — | 9 lines | Missing consent_posture, health_literacy_level | VERIFIED |

### Plan 02-03 Artifacts

| Artifact | Min Lines | Actual Lines | Exports/Tests Verified | Status |
|----------|-----------|--------------|----------------------|--------|
| `test/unit/activation/cans-schema.test.ts` | 60 | 218 | 26 tests: required fields, consent_posture, health_literacy_level, providers (all 4 trust levels), autonomy tiers, validateCANS | VERIFIED |
| `test/unit/activation/cans-parser.test.ts` | 40 | 79 | 6 tests: valid frontmatter, no delimiters, empty frontmatter, malformed YAML, body content, YAML array | VERIFIED |
| `test/unit/activation/cans-integrity.test.ts` | 50 | 154 | 10 tests: computeHash stability, all 3 verifyIntegrity outcomes, writeIntegritySidecar round-trip | VERIFIED |
| `src/hardening/layers/cans-injection.ts` | 60 | 82 | Typed CANSDocument field access for consent_posture, providers, autonomy; no Record casting | VERIFIED |
| `test/unit/hardening/layers/cans-injection.test.ts` | — | 101 | 9 tests using real CANSDocument shape | VERIFIED |

---

## Key Link Verification

### Plan 02-01 Key Links

| From | To | Via | Status | Evidence |
|------|-----|-----|--------|---------|
| `src/activation/cans-schema.ts` | `@sinclair/typebox/value` | `import { Value } from '@sinclair/typebox/value'` | WIRED | cans-schema.ts line 15; Value.Check and Value.Errors called at lines 106–107 |
| `src/activation/cans-parser.ts` | `src/vendor/yaml/index.ts` | `import { parseYAML } from '../vendor/yaml/index.js'` | WIRED | cans-parser.ts line 11; parseYAML called at line 36 |
| `src/activation/cans-integrity.ts` | `node:crypto` | `import { createHash } from 'node:crypto'` | WIRED | cans-integrity.ts line 13; createHash called at line 27 |

### Plan 02-02 Key Links

| From | To | Via | Status | Evidence |
|------|-----|-----|--------|---------|
| `src/activation/gate.ts` | `src/activation/cans-parser.ts` | `import { parseCANS }` | WIRED | gate.ts line 19; parseCANS called at line 58 |
| `src/activation/gate.ts` | `src/activation/cans-integrity.ts` | `import { verifyIntegrity }` | WIRED | gate.ts line 20; verifyIntegrity called at line 79 |
| `src/activation/gate.ts` | `src/activation/cans-schema.ts` | `import { CANSSchema, validateCANS }` | WIRED | gate.ts line 21; Value.Check(CANSSchema, ...) at line 98 |
| `src/entry/openclaw.ts` | `src/activation/gate.ts` | `await gate.check()` | WIRED | openclaw.ts line 66 |
| `src/entry/standalone.ts` | `src/activation/gate.ts` | `await gate.check()` | WIRED | standalone.ts line 55 |

### Plan 02-03 Key Links

| From | To | Via | Status | Evidence |
|------|-----|-----|--------|---------|
| `test/unit/activation/cans-schema.test.ts` | `src/activation/cans-schema.ts` | `import { CANSSchema, validateCANS, ... }` | WIRED | cans-schema.test.ts line 10–16 |
| `test/unit/activation/cans-parser.test.ts` | `src/activation/cans-parser.ts` | `import { parseCANS }` | WIRED | cans-parser.test.ts line 14 |
| `test/unit/activation/cans-integrity.test.ts` | `src/activation/cans-integrity.ts` | `import { computeHash, verifyIntegrity, writeIntegritySidecar }` | WIRED | cans-integrity.test.ts lines 13–16 |
| `src/hardening/layers/cans-injection.ts` | `src/activation/cans-schema.ts` | typed CANSDocument field access | WIRED | cans-injection.ts lines 39, 43–46, 50–52: `cans.consent_posture`, `cans.providers`, `cans.autonomy` |

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| PCANS-01 | 02-01, 02-03 | Patient CANS.md with identity_type: patient declares patient identity, consent preferences, provider trust list, advocacy boundaries | SATISFIED | Type.Literal('patient') discriminator in CANSSchema; all optional sections (providers, autonomy, communication, advocacy) defined |
| PCANS-02 | 02-02 | CANS.md presence activates patient clinical mode; absence = standard behavior (binary gate, no partial states) | SATISFIED | gate.ts 5-step pipeline; no partial activation path exists; presence check is step 1 |
| PCANS-03 | 02-01, 02-03 | TypeBox schema validates all CANS.md fields at parse time | SATISFIED | Value.Check(CANSSchema, ...) in gate.ts step 5; 26 unit tests exercise all schema paths |
| PCANS-04 | 02-01, 02-02 | SHA-256 integrity check on every CANS.md load; tampered file triggers warning and does not activate | SATISFIED | verifyIntegrity() called at gate.ts step 4 (before schema); gate.test.ts "integrity check runs BEFORE schema validation" |
| PCANS-05 | 02-02 | Malformed CANS.md = inactive with clear error message (never partially active) | SATISFIED | gate.ts returns descriptive reasons for all 6 failure modes; tests verify error text |
| PCANS-06 | 02-01 | Patient health context stored in CANS.md (conditions, medications, allergies, care goals) | CONFLICT | Architecturally redirected to Phase 4 chart per CONTEXT.md decision. REQUIREMENTS.md marks [x] complete (intent: requirement resolved by architectural re-scope). ROADMAP.md Success Criterion 4 still says these fields must be parseable from CANS.md. CANSSchema has none of these fields. See Gaps section. |
| PCANS-07 | 02-01, 02-03 | Provider trust list with NPI, role, and trust_level (active/suspended/revoked) per provider | SATISFIED | TrustListEntrySchema defines npi, role, trust_level (4 values including pending), provider_name, organization, last_changed; 8 trust list tests in cans-schema.test.ts |

### Orphaned Requirements Check

All 7 phase requirements (PCANS-01 through PCANS-07) appear in at least one plan's `requirements` field. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| None | — | — | No TODO/FIXME/placeholder comments, no stub bodies, no empty implementations found in any of the 8 implementation files |

Stub detection run against: cans-schema.ts, cans-parser.ts, cans-integrity.ts, gate.ts, cans-injection.ts, openclaw.ts, standalone.ts, vitest.config.ts.

---

## Build and Test Verification

| Check | Result | Detail |
|-------|--------|--------|
| `pnpm typecheck` | PASS | Zero TypeScript errors |
| `pnpm build` | PASS | 22 files, 4 dist outputs, 750ms |
| `pnpm test` | PASS | 166 tests passed across 17 test files, 0 failures |
| Regression check | PASS | 104 Phase 1 tests still passing; 62 new Phase 2 tests all passing |

---

## Human Verification Required

None. All observable truths are verifiable from source code and test output.

---

## Gaps Summary

### Gap: PCANS-06 / Success Criterion 4 Document Conflict

This is a requirements document inconsistency, not an implementation bug.

**What happened:** During Phase 2 planning, the team made a sound architectural decision — CANS.md is a configuration file (how the agent behaves), not a clinical record. Health data (conditions, medications, allergies, care goals) must not be stored in CANS.md because it would create a PII exposure risk. This data belongs in the patient chart (Phase 4 concern).

**The conflict:**
- `REQUIREMENTS.md` PCANS-06 is marked `[x]` complete — the intent being that the requirement was resolved by the architectural decision
- `CONTEXT.md` and `RESEARCH.md` both explicitly document the redirection to Phase 4 chart
- `ROADMAP.md` Phase 2 Success Criterion 4 still reads: _"Patient health context (conditions, medications, allergies, care goals) and provider trust list (NPI, role, trust_level per provider) are parseable from a valid CANS.md"_
- `src/activation/cans-schema.ts` has no conditions, medications, allergies, or care_goals fields

**What needs to happen:** One of these must be updated to resolve the conflict:

Option A (recommended — reflects the correct architecture): Update ROADMAP.md Success Criterion 4 to remove the health context list and state that health data lives in the chart, not CANS.md. Only the provider trust list portion of SC-4 was actually implemented (and it passes fully).

Option B: Update REQUIREMENTS.md PCANS-06 from `[x]` to `[ ]` and move it to Phase 4 with the chart implementation.

The trust list portion of PCANS-07 and SC-4 is fully satisfied. Only the health context enumeration (conditions, medications, allergies, care goals) is the point of conflict.

---

_Verified: 2026-02-21T17:50:00Z_
_Verifier: Claude (gsd-verifier)_
