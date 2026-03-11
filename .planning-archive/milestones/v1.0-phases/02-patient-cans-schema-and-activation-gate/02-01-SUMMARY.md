---
phase: 02-patient-cans-schema-and-activation-gate
plan: 01
subsystem: activation
tags: [typebox, yaml, sha256, cans-schema, integrity, frontmatter]

# Dependency graph
requires:
  - phase: 01-plugin-scaffolding-and-platform-portability
    provides: Stub activation files, vendor yaml, TypeBox devDep, hardening layers with defensive CANS access
provides:
  - Full TypeBox CANSSchema with required/optional fields and CANSDocument type
  - validateCANS() for CLI validation (throws on invalid, returns typed document)
  - parseCANS() YAML frontmatter parser with edge case handling
  - computeHash() SHA-256 of raw file content
  - verifyIntegrity() async sidecar-file integrity check with discriminated failures
  - writeIntegritySidecar() for CLI signing workflow
  - TrustListEntrySchema and TrustLevelSchema sub-schemas for reuse
affects: [02-02 gate.ts, 02-03 tests, phase-04 onboarding CLI, phase-05 consent engine]

# Tech tracking
tech-stack:
  added: []
  patterns: [TypeBox sub-schema composition, sidecar integrity file, YAML frontmatter parsing with edge cases, discriminated union result types]

key-files:
  created: []
  modified:
    - src/activation/cans-schema.ts
    - src/activation/cans-parser.ts
    - src/activation/cans-integrity.ts

key-decisions:
  - "Sidecar file .CANS.md.sha256 for integrity (avoids YAML round-trip instability)"
  - "IntegrityResult discriminated union distinguishes no-sidecar vs hash-mismatch"
  - "verifyIntegrity is async (reads sidecar file) -- breaking change from sync stub"
  - "Exported TrustListEntrySchema and TrustLevelSchema for test reuse"

patterns-established:
  - "TypeBox sub-schema composition: define named sub-schemas, compose into root schema"
  - "Discriminated union result types: IntegrityResult with reason field for failure modes"
  - "YAML frontmatter parser returning error string instead of throwing"

requirements-completed: [PCANS-01, PCANS-03, PCANS-04, PCANS-06, PCANS-07]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 2 Plan 01: CANS Foundation Modules Summary

**TypeBox CANSSchema with patient discriminator, YAML frontmatter parser, and SHA-256 sidecar integrity checker -- three foundation modules replacing Phase 1 stubs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T22:27:18Z
- **Completed:** 2026-02-21T22:30:29Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Full TypeBox schema with 4 required fields, 4 optional sections, provider trust list with 4 trust levels, and per-action autonomy tiers
- YAML frontmatter parser handling all edge cases: no delimiters, empty frontmatter, malformed YAML, valid content
- SHA-256 integrity module with sidecar file approach distinguishing no-sidecar vs hash-mismatch failures
- Zero new npm dependencies -- all implementation uses existing TypeBox, vendor yaml, and node:crypto

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement CANSSchema TypeBox schema and validateCANS()** - `8697856` (feat)
2. **Task 2: Implement parseCANS() parser and cans-integrity module** - `f5b996e` (feat)

## Files Created/Modified
- `src/activation/cans-schema.ts` - Full TypeBox CANSSchema with sub-schemas, CANSDocument type, validateCANS()
- `src/activation/cans-parser.ts` - parseCANS() YAML frontmatter parser with ParsedFrontmatter interface
- `src/activation/cans-integrity.ts` - computeHash(), verifyIntegrity(), writeIntegritySidecar() with IntegrityResult type

## Decisions Made
- Used sidecar file `.CANS.md.sha256` for integrity storage (avoids YAML round-trip instability from inline approach)
- IntegrityResult is a discriminated union with `reason` field distinguishing `no-sidecar` vs `hash-mismatch` failure modes
- verifyIntegrity is async (reads sidecar file from disk) -- intentional breaking change from the sync stub signature
- Exported TrustListEntrySchema and TrustLevelSchema as named exports for test reuse and sub-schema validation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three foundation modules are implemented and verified
- gate.ts (Plan 02) can now import parseCANS, verifyIntegrity, CANSSchema, and Value.Check to build the activation pipeline
- Plan 03 tests can validate all must_have truths against these implementations
- No blockers for Plan 02 or Plan 03

## Self-Check: PASSED

- All 3 source files exist and contain expected exports
- Both task commits verified in git log (8697856, f5b996e)
- cans-schema.ts exports: CANSSchema, CANSDocument, validateCANS, TrustLevelSchema, TrustListEntrySchema
- cans-parser.ts exports: ParsedFrontmatter, parseCANS
- cans-integrity.ts exports: IntegrityResult, computeHash, verifyIntegrity, writeIntegritySidecar
- pnpm typecheck: zero errors
- pnpm build: 22 files, 4 dist outputs
- pnpm test: 104 tests passed (zero regression)

---
*Phase: 02-patient-cans-schema-and-activation-gate*
*Completed: 2026-02-21*
