---
phase: 01-plugin-scaffolding-and-platform-portability
plan: 01
subsystem: infra
tags: [typescript, tsdown, esm, openclaw-plugin, platform-adapter, zero-dependency]

# Dependency graph
requires: []
provides:
  - "Buildable @careagent/patient-core TypeScript project with zero runtime deps"
  - "PlatformAdapter interface with registerHook extensibility"
  - "OpenClaw adapter with graceful degradation (try/catch wrapping)"
  - "Standalone adapter with no-op implementations"
  - "Duck-type platform detection (openclaw vs standalone)"
  - "Plugin manifest (openclaw.plugin.json) for OpenClaw discovery"
  - "All stub modules for activation, audit, cli, credentials, skills, onboarding, refinement, protocol, neuron, chart"
  - "4 entry points: default (OpenClaw), openclaw, standalone, core (types-only)"
affects: [01-02, phase-2, phase-3, phase-4, phase-5, phase-6, phase-7, phase-8]

# Tech tracking
tech-stack:
  added: [typescript ~5.7.0, tsdown ~0.20.0, vitest ~4.0.0, "@vitest/coverage-v8 ~4.0.0", "@sinclair/typebox ~0.34.0", "yaml ^2.8.2", "@types/node@22"]
  patterns: [esm-only, zero-runtime-deps, duck-type-detection, try-catch-wrapping, vendor-yaml-bundling]

key-files:
  created:
    - package.json
    - tsconfig.json
    - tsdown.config.ts
    - vitest.config.ts
    - openclaw.plugin.json
    - src/adapters/types.ts
    - src/adapters/detect.ts
    - src/adapters/openclaw/index.ts
    - src/adapters/standalone/index.ts
    - src/adapters/index.ts
    - src/vendor/yaml/index.ts
    - src/index.ts
    - src/entry/openclaw.ts
    - src/entry/standalone.ts
    - src/entry/core.ts
    - src/chart/types.ts
    - src/activation/gate.ts
    - src/audit/pipeline.ts
    - src/cli/commands.ts
  modified: []

key-decisions:
  - "Added @types/node@22 devDependency for Node.js type resolution (process, console, node:* modules)"
  - "Patient audit entry actor uses 'patient' instead of 'provider' to match patient-core context"
  - "Patient audit action states use patient-approved/patient-modified/patient-rejected instead of provider-*"
  - "Hook registry is adapter-internal (Map-based) rather than forwarding to OpenClaw events"
  - "Refinement observation categories adapted for patient context: preference, consent, health_context, communication"
  - "NeuronRegistration uses patientName instead of providerName/specialty"

patterns-established:
  - "Mirror provider-core: copy patterns exactly unless patient-specific requirements force a difference"
  - "PlatformAdapter with registerHook: all host interactions go through this interface"
  - "Graceful degradation: every OpenClaw API call wrapped in try/catch with fallback"
  - "Duck-type detection: typeof raw?.registerCli === 'function' && typeof raw?.on === 'function'"
  - "Stub pattern: export types and factory functions that throw 'not yet implemented (Phase N)'"
  - "Vendor bundling: yaml is devDependency bundled by tsdown into dist for zero runtime deps"

requirements-completed: [PLUG-01, PLUG-03, PLUG-04, PORT-01, PORT-02]

# Metrics
duration: 7min
completed: 2026-02-21
---

# Phase 1 Plan 01: Project Scaffolding Summary

**Zero-dep ESM project with PlatformAdapter (8 methods including registerHook), duck-type detection, OpenClaw/standalone adapters, plugin manifest, and 44 stub modules across 14 subsystem directories**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-21T21:04:31Z
- **Completed:** 2026-02-21T21:12:24Z
- **Tasks:** 3
- **Files modified:** 52

## Accomplishments
- Buildable TypeScript project with zero runtime npm dependencies, ESM-only output, 4 entry points
- PlatformAdapter interface with all 8 methods (7 from provider-core + registerHook extensibility)
- OpenClaw adapter wraps every raw API call in try/catch with graceful degradation
- Complete directory structure mirroring provider-core with all stub modules for future phases
- pnpm typecheck and pnpm build both pass with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create project config files and install dependencies** - `77a26b5` (feat)
2. **Task 2: Create PlatformAdapter interface, detection, and both adapter implementations** - `7051e20` (feat)
3. **Task 3: Create all stub modules for future phases** - `a695476` (feat)

## Files Created/Modified
- `package.json` - Zero-dep ESM package with 4 exports, openclaw optional peer dep
- `tsconfig.json` - ES2023/NodeNext/strict TypeScript config
- `tsdown.config.ts` - 4 entry points, ESM, DTS, external openclaw
- `vitest.config.ts` - 80% coverage thresholds, V8 provider
- `openclaw.plugin.json` - Plugin manifest with @careagent/patient-core ID
- `.gitignore` - Standard ignores (node_modules, dist, coverage)
- `.npmrc` - shamefully-hoist=false, strict-peer-dependencies=false
- `src/adapters/types.ts` - PlatformAdapter interface with registerHook
- `src/adapters/detect.ts` - Duck-type platform detection + createAdapter factory
- `src/adapters/openclaw/index.ts` - OpenClaw adapter with try/catch wrapping + hook registry
- `src/adapters/standalone/index.ts` - Standalone adapter with no-ops + console logging
- `src/adapters/index.ts` - Module re-exports
- `src/vendor/yaml/index.ts` - Centralized YAML re-exports (parseYAML, stringifyYAML)
- `src/activation/gate.ts` - ActivationGate stub (always returns inactive)
- `src/activation/cans-schema.ts` - Placeholder CANSDocument type with identity_type discriminator
- `src/activation/cans-parser.ts` - YAML frontmatter parser stub
- `src/activation/cans-integrity.ts` - SHA-256 integrity check stub
- `src/audit/entry-schema.ts` - TypeBox audit entry schema (patient-adapted action states)
- `src/audit/writer.ts` - Hash-chained JSONL writer stub
- `src/audit/pipeline.ts` - AuditPipeline with log/logBlocked/verifyChain stubs
- `src/audit/integrity-service.ts` - Background integrity service stub
- `src/cli/commands.ts` - registerCLI wiring careagent init + careagent status
- `src/cli/init-command.ts` - Init command stub (Phase 4)
- `src/cli/status-command.ts` - Status command stub (Phase 4)
- `src/cli/io.ts` - InterviewIO interface + createTerminalIO + createMockIO
- `src/cli/prompts.ts` - Reusable prompt utilities
- `src/credentials/` - CredentialValidator interface, factory stub, re-exports
- `src/skills/` - SkillManifest types, manifest-schema, integrity, version-pin, loader stubs
- `src/onboarding/` - workspace-profiles (3 platforms), engine, stages, defaults, review, content, writer, cans-generator stubs
- `src/refinement/` - RefinementEngine interface + factory stub, observation/proposal types
- `src/protocol/` - ProtocolServer interface + factory stub
- `src/neuron/` - NeuronClient interface + factory stub
- `src/chart/types.ts` - PatientChartVault interface (read, write, checkAccess)
- `src/entry/openclaw.ts` - register(api) placeholder
- `src/entry/standalone.ts` - activate() placeholder
- `src/entry/core.ts` - Pure type/class re-exports
- `src/index.ts` - Default export re-exporting OpenClaw plugin

## Decisions Made
- Added @types/node@22 as devDependency: TypeScript does not ship Node.js built-in types (process, console, node:fs, etc.). Provider-core has the same gap. Required for pnpm typecheck to pass.
- Patient audit entry-schema uses 'patient' as actor (not 'provider') and patient-approved/modified/rejected as action states to match patient-core context.
- Hook registry uses internal Map rather than forwarding to OpenClaw's event system, per RESEARCH.md recommendation (avoids coupling hook naming to OpenClaw events).
- Refinement observation categories adapted for patient context (preference, consent, health_context, communication) instead of provider-core's (voice, autonomy, credential, skill_usage, identity).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @types/node@22 devDependency**
- **Found during:** Task 2 (adapter implementation)
- **Issue:** TypeScript cannot resolve `process`, `console`, `node:fs`, `node:crypto` without Node.js type declarations. Neither provider-core nor patient-core had @types/node installed.
- **Fix:** Added `@types/node@22` as a devDependency via `pnpm add -D @types/node@22`
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `pnpm typecheck` passes with zero errors
- **Committed in:** 7051e20 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the @types/node deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01-02 can proceed: all adapter types, detection, and stub modules are in place
- Plan 01-02 will wire the full entry point flows (openclaw register, standalone activate) with hardening engine
- Plan 01-02 will add comprehensive test suite
- All subsequent phases have their stub modules ready with type exports

---
*Phase: 01-plugin-scaffolding-and-platform-portability*
*Completed: 2026-02-21*

## Self-Check: PASSED

All 57 created files verified present. All 3 task commits verified in git log.
