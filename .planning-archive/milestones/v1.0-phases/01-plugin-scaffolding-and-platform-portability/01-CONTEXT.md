# Phase 1: Plugin Scaffolding and Platform Portability - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the foundational TypeScript project structure, plugin manifest, platform adapter, entry points, and zero-dep build system. A developer can install patient-core as an OpenClaw plugin and the system initializes without errors across all three entry points (OpenClaw plugin, standalone, core/types-only).

Requirements: PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, PORT-01, PORT-02, PORT-03, PORT-04.

</domain>

<decisions>
## Implementation Decisions

### Core Principle: Mirror Provider-Core

patient-core mirrors @careagent/provider-core's structure, patterns, and conventions as closely as possible. The codebases share ~80% identical infrastructure. Differences arise only where patient-specific functionality demands them (CANS schema fields, onboarding stages, consent layers, skills). The scaffolding itself is identical.

Reference implementation: @careagent/provider-core at /Users/medomatic/Documents/Projects/provider-core/

### Project Structure

- Mirror provider-core's exact directory layout: src/adapters/, src/activation/, src/audit/, src/entry/, src/hardening/, src/credentials/, src/skills/, src/onboarding/, src/refinement/, src/protocol/, src/neuron/, src/cli/, src/vendor/
- Add src/chart/ with a types.ts stub defining the interface for patient-chart vault communication (patient-chart is a separate project at /Users/medomatic/Documents/Projects/patient-chart/)
- Same test/ directory structure mirroring src/

### Naming

- Package: `@careagent/patient-core`
- Plugin display name: `CareAgent` (same as provider-core)
- CLI commands: `careagent init`, `careagent status` (same as provider-core)
- Plugin ID: `@careagent/patient-core`

### Build and Tooling (Match Provider-Core Exactly)

- Bundler: tsdown ~0.20.0
- Output: ESM-only
- Node engine: >=22.12.0
- TypeBox: ~0.34.0
- vitest: ~4.0.0
- TypeScript: ~5.7.0
- Zero runtime npm dependencies
- OpenClaw as optional peer dependency (>=2026.1.0)
- Four tsdown entry points: src/index.ts, src/entry/openclaw.ts, src/entry/standalone.ts, src/entry/core.ts
- Same package.json exports map pattern as provider-core

### Plugin Manifest (openclaw.plugin.json)

- id: `@careagent/patient-core`
- name: `CareAgent`
- skills: `[]` (empty array; skills come in Phase 7)
- commands and hooks registered at runtime (same pattern as provider-core)

### Entry Points (Identical to Provider-Core)

- OpenClaw entry (src/entry/openclaw.ts): register(api) function — creates adapter, starts audit, registers CLI, checks activation gate, if active: hardening + skills + refinement + background services
- Standalone entry (src/entry/standalone.ts): activate() function — same flow but returns constructed objects, standalone adapter with no-ops for hooks + console logging
- Core entry (src/entry/core.ts): pure type re-exports, no side effects
- Default entry (src/index.ts): re-exports OpenClaw plugin

### Platform Adapter

- Same PlatformAdapter interface as provider-core: getWorkspacePath(), onBeforeToolCall(), onAgentBootstrap(), registerCliCommand(), registerBackgroundService(), registerSlashCommand(), log()
- Add a generic registerHook(name, handler) extensibility method for future patient-specific hooks (consent gate, channel transport) without changing the core interface
- Same duck-typing detection: `typeof api.registerCli === 'function' && typeof api.on === 'function'` → openclaw, else → standalone
- Same graceful degradation pattern: every OpenClaw interaction wrapped in try/catch, warn + no-op on failure
- Same standalone adapter: no-ops for all registration methods, console logging

### Hardening Layers

- Same 4 layers as provider-core: tool-policy, exec-allowlist, cans-injection, docker-sandbox
- Add empty stubs for patient-specific layers: consent-gate.ts and data-minimization.ts, registered in pipeline but returning allow-all until implemented in Phase 5
- Same ordered pipeline pattern: first deny wins, each layer logs independently

### Stubs

- src/protocol/ and src/neuron/ stubs matching provider-core (Phase 5+ functionality)
- src/chart/types.ts stub defining the patient-chart vault interface contract (read, write, access check)

### Claude's Discretion

- Exact file naming within directories (following provider-core conventions)
- Internal module organization where provider-core patterns apply directly
- Test fixture structure
- TypeScript strict mode configuration details

</decisions>

<specifics>
## Specific Ideas

- "patient-core will probably share 95% of the exact same code as provider-core" — the codebases must be as close as possible because they live in personalized agents and are installed the same way
- Provider-core at /Users/medomatic/Documents/Projects/provider-core/ is the reference implementation — match its patterns exactly unless patient-specific requirements force a difference
- patient-chart at /Users/medomatic/Documents/Projects/patient-chart/ is a separate encrypted vault project; patient-core communicates with it via a local API (types stub in Phase 1)
- The activation gate will need to distinguish patient CANS.md from provider CANS.md via `identity_type: patient` discriminator (Phase 2 concern, but the gate scaffolding in Phase 1 should accommodate this)

</specifics>

<deferred>
## Deferred Ideas

- `patientagent chart status` CLI command — future phase when patient-chart integration is active
- Channel spec ownership and implementation — Phase 6
- Consent engine and data minimization layers — Phase 5 (empty stubs scaffolded in Phase 1)
- Patient-specific CANS.md schema fields — Phase 2
- Patient-specific onboarding stages — Phase 4

</deferred>

---

*Phase: 01-plugin-scaffolding-and-platform-portability*
*Context gathered: 2026-02-21*
