# @careagent/patient-core

## What This Is

An OpenClaw plugin that transforms an AI agent workspace into a patient-facing clinical agent. The patient-side counterpart to `@careagent/provider-core` -- independently implemented, no shared dependencies. A patient installs patient-core, completes a conversational onboarding interview, and receives a personalized agent that controls their health data, manages consent, communicates with trusted providers' CareAgents through a secure channel, and logs everything to a patient-owned audit trail.

## Core Value

The patient is the ultimate authority over their health information -- nothing leaves their workspace without explicit consent, and their agent advocates for their stated preferences at every interaction.

## Requirements

### Validated

- v1.0 OpenClaw plugin with PlatformAdapter abstraction (PLUG-01..05, PORT-01..04)
- v1.0 Patient CANS.md activation gate with TypeBox schema, SHA-256 integrity, binary active/inactive (PCANS-01..07)
- v1.0 Hash-chained JSONL audit pipeline with async buffered writes, bilateral correlation, patient ownership (AUDT-01..06, DFNS-04)

### Active

- [ ] 9-stage conversational onboarding interview generating CANS.md
- [ ] Consent engine (deny-by-default, per-provider trust, consent gate on all outbound data)
- [ ] Data minimization on all outbound messages
- [ ] Secure communication channel (patient-owned spec, encrypted, consent-gated, auditable)
- [ ] Provider verification (NPI + trust_level check before engagement)
- [ ] share-skill (supervised -- patient reviews before send)
- [ ] request-skill (autonomous/supervised per config)
- [ ] review-skill (summarizes provider proposals in plain language)
- [ ] consent-skill (always manual -- agent never consents on patient's behalf)
- [ ] End-to-end integration: patient-core <-> provider-core via secure channel
- [ ] Architecture guide, installation docs, onboarding walkthrough, channel protocol spec

### Out of Scope

- Medical advice or diagnosis -- agent facilitates, never interprets or recommends
- Direct EHR/portal access -- provider's agent handles clinical system interfaces
- Autonomous health decisions -- Consent action hardcoded to manual
- Bulk data export -- undermines data minimization; share is per-interaction
- Multi-patient/caregiver support -- requires proxy consent and regulatory analysis (v2+)
- Insurance/billing optimization -- financial advice liability
- Real patient data (PHI) in dev -- synthetic data only, PHI-ready architecture
- Per-data-category consent matrix -- v2 feature (CSNT-08, CSNT-09)
- Network transport (HTTP/A2A) -- v1 uses file-based mailbox; production transport is v2

## Context

- **Current state:** v1.0 Foundation shipped (2026-02-22). 6,314 LOC TypeScript, 227 tests, 93%+ coverage. Plugin scaffold, CANS activation gate, and audit pipeline complete.
- **Ecosystem:** Part of the CareAgent ecosystem alongside provider-core. Both share architectural concepts (audit pipeline, CANS schema, platform adapter) but implement them independently.
- **Provider-core status:** v1 Phases 1-5 complete (28/28 plans), Phase 6 (Docs) in progress. Agent-to-Agent Communication deferred to v2. Patient-core integration testing uses mock provider conformance harness.
- **Hybrid architecture:** Plugin + Dedicated Agent model. The plugin handles system-level concerns (CLI, hooks, audit, tool policy). A dedicated `patientagent` provides persistent clinical workspace with CANS.md, workspace files, and clinical skills. OpenClaw multi-agent routing directs provider messages to the patient's agent.
- **Platform:** OpenClaw plugin (primary), with support for AGENTS.md standard, Claude Code (CLAUDE.md), and library/programmatic usage.
- **Data sovereignty principle:** The patient sets the rules of engagement. The channel spec is owned by patient-core, not provider-core.
- **Four atomic actions:** Share (supervised), Request (autonomous), Review (autonomous), Consent (always manual). These mirror provider-core's Chart/Order/Charge/Perform from the patient's perspective.
- **Channel transport:** File-based encrypted mailbox for v1 (zero-dep, offline-first, CLI-compatible). AES-256-GCM with counter-based IVs via Node.js built-in crypto. A2A Protocol-compatible envelope for future production upgrade.
- **Consent enforcement:** Skill-internal two-phase flow (not hook-dependent). Tool policy (allow/deny lists) at config-time as primary enforcement. OpenClaw's `before_tool_call` hook is a backstop only.
- **Known tech debt from v1.0:** 11 stale stub-era try/catch comments (clean before Phase 4 adds call sites), CLI handler stubs, `writeIntegritySidecar` not yet consumed by source.

## Constraints

- **Runtime:** Node.js >=22.12.0
- **Language:** TypeScript ~5.7.x
- **Package manager:** pnpm
- **Build:** tsdown ~0.20.x
- **Test:** vitest ~4.0.x (80% coverage thresholds)
- **Schema:** @sinclair/typebox ~0.34.x
- **Zero runtime deps:** All runtime needs from Node.js built-ins; YAML bundled via tsdown
- **Peer dep:** OpenClaw >=2026.1.0 (optional)
- **FHIR types:** @medplum/fhirtypes ~5.0.x (dev only)
- **Synthetic data only:** No real PHI in development
- **Single patient:** No multi-patient or caregiver proxy in v1
- **CLI only:** Interaction through OpenClaw
- **VPS-only development:** Never modify local OpenClaw installation
- **No provider-core dependency:** Shared concepts independently implemented

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Standalone repo | Maximum decoupling from provider-core; independent build/test/release | Good |
| File-based encrypted mailbox for v1 channel | Zero-dep, offline-first, CLI-compatible; A2A-compatible envelope for future upgrade | Pending |
| Hybrid plugin + dedicated agent model | Plugin for system concerns, dedicated agent for persistent clinical workspace; matches provider-core approach | Good |
| Consent as skill-internal flow, not hook-dependent | OpenClaw before_tool_call can't pause/resume (issue #19072); tool policy at config-time is primary enforcement | Pending |
| Counter-based IVs for AES-256-GCM | Random IVs dangerous at scale (96-bit space); counter-based with per-sender prefix is safe | Pending |
| Risk-stratified consent tiers | Prevent consent fatigue from undermining deny-by-default; must be Phase 5 design-time, not retrofit | Pending |
| Deny-by-default consent | Data sovereignty principle -- explicit opt-in per provider | Good |
| Consent action always manual | Hard constraint -- agent never consents on patient's behalf | Good |
| Zero runtime npm dependencies | Matches provider-core; minimizes supply chain risk for clinical software | Good |
| Sidecar file (.CANS.md.sha256) for integrity | Avoids YAML round-trip instability from inline _integrity approach | Good |
| Integrity check BEFORE schema validation in gate | Tampered-but-schema-valid CANS.md must fail on integrity, not schema; prevents bypass | Good |
| Async-buffered audit writes with unref'd timers | Never blocks patient workflow; prevents Node.js process hangs | Good |
| Explicit JSON field ordering in audit entries | Prevents non-deterministic serialization that would break hash chain | Good |
| Integrity service reports and continues on chain break | No quarantine, no chain restart -- report error and keep appending | Good |

---
*Last updated: 2026-02-22 after v1.0 milestone*
