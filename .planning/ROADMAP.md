# Roadmap: @careagent/patient-core

**Created:** 2026-02-18
**Depth:** Comprehensive
**Phases:** 8
**Coverage:** 69/69 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Plugin Scaffolding and Platform Portability** - TypeScript project structure, plugin manifest, platform adapter, entry points, zero-dep build
- [ ] **Phase 2: Patient CANS Schema and Activation Gate** - TypeBox schema for Patient CANS.md, SHA-256 integrity, binary activation gate, health context and trust list structures
- [ ] **Phase 3: Audit Pipeline** - Hash-chained JSONL audit log, async buffered writes, bilateral audit entries, integrity verification, patient ownership
- [ ] **Phase 4: Onboarding and Agent Configuration** - 9-stage conversational interview, CANS.md generation, workspace supplementation, dedicated agent setup, tool policies, status command
- [ ] **Phase 5: Consent Engine** - Deny-by-default evaluator, per-provider trust management, consent gate, data minimization, risk-stratified tiers, manual consent enforcement, v2-ready architecture
- [ ] **Phase 6: Secure Channel Protocol** - Channel spec ownership, AES-256-GCM encryption, file-based mailbox transport, provider verification, consent-gated messaging, protocol versioning, spec publication
- [ ] **Phase 7: Patient Skills and Defense Integration** - Four atomic skills (Share, Request, Review, Consent), BaseSkill template, skill-internal consent flow, data minimization enforcement, autonomy tiers
- [ ] **Phase 8: Integration Testing and Documentation** - End-to-end flow validation, cross-repo communication, protocol version skew testing, architecture guide, installation walkthrough, channel spec docs

---

## Phase Details

### Phase 1: Plugin Scaffolding and Platform Portability
**Goal:** A developer can install patient-core as an OpenClaw plugin and the system initializes without errors across all supported entry points
**Depends on:** Nothing (foundation phase)
**Requirements:** PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, PORT-01, PORT-02, PORT-03, PORT-04
**Success Criteria** (what must be TRUE):
  1. Running `pnpm build` produces working artifacts for all three entry points (OpenClaw plugin, standalone, core/types-only) with zero runtime npm dependencies
  2. Installing the plugin in OpenClaw registers extensions, hooks, and services without errors, and degrades gracefully when hooks are unavailable
  3. PlatformAdapter correctly detects the host environment (OpenClaw vs standalone) via duck-typing without importing OpenClaw directly
  4. Plugin manifest declares patient-core with correct extensions, skills directory, and hook registrations that OpenClaw accepts
  5. All tests pass with vitest at 80%+ coverage thresholds
**Plans:** 2 plans
Plans:
- [ ] 01-01-PLAN.md -- Project scaffolding, config, adapter layer, and all stub modules
- [ ] 01-02-PLAN.md -- Entry points, hardening engine, and comprehensive test suite

### Phase 2: Patient CANS Schema and Activation Gate
**Goal:** The system recognizes a valid Patient CANS.md and activates clinical mode, or clearly rejects invalid/tampered files
**Depends on:** Phase 1
**Requirements:** PCANS-01, PCANS-02, PCANS-03, PCANS-04, PCANS-05, PCANS-06, PCANS-07
**Success Criteria** (what must be TRUE):
  1. A well-formed Patient CANS.md with `identity_type: patient` activates clinical mode; absence of CANS.md means standard (non-clinical) behavior with no partial states
  2. A CANS.md with a modified byte (tampered) fails SHA-256 integrity check, triggers a warning, and does not activate
  3. A CANS.md with missing or invalid fields fails TypeBox schema validation and produces a clear error message identifying the problem
  4. Patient health context (conditions, medications, allergies, care goals) and provider trust list (NPI, role, trust_level per provider) are parseable from a valid CANS.md
  5. The activation gate distinguishes patient CANS.md from provider CANS.md via the `identity_type` discriminator
**Plans:** TBD

### Phase 3: Audit Pipeline
**Goal:** Every patient action and channel interaction is logged to a verifiable, patient-owned audit trail that never blocks workflow
**Depends on:** Phase 1
**Requirements:** AUDT-01, AUDT-02, AUDT-03, AUDT-04, AUDT-05, AUDT-06, DFNS-04
**Success Criteria** (what must be TRUE):
  1. Audit entries are appended to `.careagent/AUDIT.log` as hash-chained JSONL where each entry references the previous entry's hash, and the chain is independently verifiable
  2. Audit writes are async-buffered and never block the calling workflow (a slow disk does not stall the patient's interaction)
  3. Background integrity verification detects a corrupted or missing chain link and reports the break point
  4. Audit entries log action references and metadata, not raw health data content (patient owns the log without it becoming a data exfiltration vector)
  5. The pipeline supports bilateral audit correlation IDs so both patient and provider sides can reference the same interaction
**Plans:** TBD

### Phase 4: Onboarding and Agent Configuration
**Goal:** A new patient completes a guided interview, gets a working dedicated agent with CANS.md and configured workspace, and can check their status
**Depends on:** Phase 2, Phase 3
**Requirements:** ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05, ONBD-06, PLUG-06, AGNT-01, AGNT-02, AGNT-03, AGNT-04, DFNS-05
**Success Criteria** (what must be TRUE):
  1. Running `patientagent init` walks the patient through a 9-stage conversational interview (Welcome through Review) at their chosen health literacy level, generating a valid CANS.md that passes schema validation and integrity check
  2. The patient can review, edit, and regenerate their CANS.md before finalizing; the interview never hallucinates clinical details and marks all entries as `source: "patient_reported"`
  3. A dedicated `patientagent` workspace exists at `~/.openclaw/workspace-patientagent/` with CANS.md, supplemented SOUL.md, AGENTS.md, USER.md, and skills directory, with existing workspace content preserved via HTML comment boundaries
  4. Running `patientagent status` shows activation state, CANS.md summary, consent posture, audit stats, and provider trust list
  5. The dedicated agent has clinical-safe tool policies (allow/deny lists) and sandbox configuration, and provider messages route to this agent via OpenClaw multi-agent routing
**Plans:** TBD

### Phase 5: Consent Engine
**Goal:** The patient's deny-by-default consent posture is enforced on every outbound interaction, with risk-stratified tiers that prevent consent fatigue
**Depends on:** Phase 2
**Requirements:** CSNT-01, CSNT-02, CSNT-03, CSNT-04, CSNT-05, CSNT-06, CSNT-07
**Success Criteria** (what must be TRUE):
  1. No data leaves the patient workspace without passing through the consent gate, which checks: is the provider trusted (active status)? is the data category permitted? has the patient approved this specific interaction?
  2. Per-provider trust states (active/suspended/revoked) are enforced -- suspended and revoked providers receive nothing, and trust state changes propagate immediately to block in-flight interactions
  3. Risk-stratified consent tiers are active: routine actions (e.g., appointment requests) can be batched/grouped for approval, while sensitive actions (e.g., sharing mental health records) require individual patient approval
  4. The consent action is always manual -- there is no configuration, flag, or override that allows the agent to consent on the patient's behalf
  5. The consent engine's internal architecture accommodates a future per-data-category matrix (v2) without requiring a rewrite of the evaluation pipeline
**Plans:** TBD

### Phase 6: Secure Channel Protocol
**Goal:** Patient and provider agents can exchange encrypted, authenticated messages through a patient-owned channel protocol with published spec
**Depends on:** Phase 3, Phase 5
**Requirements:** CHAN-01, CHAN-02, CHAN-03, CHAN-04, CHAN-05, CHAN-06, CHAN-07, CHAN-08, DFNS-03
**Success Criteria** (what must be TRUE):
  1. Messages between patient and provider are encrypted with AES-256-GCM using counter-based IVs (not random) and authenticated with Ed25519 signatures, using only Node.js built-in crypto
  2. The file-based encrypted mailbox transport works offline-first: messages persist as files in inbox/outbox directories, survive restarts, and are patient-inspectable
  3. Provider identity is verified (NPI lookup + trust_level check from CANS.md) before any channel engagement; stale or revoked trust states block communication
  4. Outbound messages pass through the consent gate; inbound messages are validated against the provider trust list -- the channel enforces both directions
  5. The channel spec is published as TypeScript types + JSON Schema artifacts that provider-core can consume to build a conforming ChannelAdapter, with a protocol version field in every message envelope for forward compatibility
**Plans:** TBD

### Phase 7: Patient Skills and Defense Integration
**Goal:** Patients can share health information, make requests, review provider communications, and manage consent through four atomic skills that enforce all defense layers
**Depends on:** Phase 5, Phase 6
**Requirements:** SKIL-01, SKIL-02, SKIL-03, SKIL-04, SKIL-05, SKIL-06, SKIL-07, DFNS-01, DFNS-02
**Success Criteria** (what must be TRUE):
  1. Share-skill presents prepared health information for patient review before sending, applies data minimization to strip to the minimum relevant data set, and transmits only after explicit patient approval (supervised mode)
  2. Request-skill initiates provider requests (appointments, referrals, records, explanations) respecting the autonomy tier configured in CANS.md (autonomous or supervised per action type)
  3. Review-skill processes inbound provider communications, summarizes them in plain language at the patient's configured health literacy level, highlights required decisions, and flags conflicts with the patient's stated care goals
  4. Consent-skill presents consent requests with plain-language explanations, enforces always-manual approval (patient decides every time), and logs every decision bilaterally
  5. All four skills refuse to load without a valid Patient CANS.md, implement the skill-internal two-phase consent flow (not hook-dependent), and ship via `openclaw.plugin.json` skills directories for automatic loading
**Plans:** TBD

### Phase 8: Integration Testing and Documentation
**Goal:** A developer can install patient-core, complete onboarding, communicate with a provider-core agent, and understand the entire system from documentation alone
**Depends on:** Phase 7
**Requirements:** INTG-01, INTG-02, INTG-03, INTG-04, DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05
**Success Criteria** (what must be TRUE):
  1. The end-to-end flow works: install patient-core, complete onboarding, activate dedicated agent, send a message to a mock provider agent (conformance harness), receive a response, verify consent was checked, and confirm the audit trail is complete
  2. Patient-core communicates bidirectionally with a mock provider conformance harness via the secure channel using the published spec, with bilateral audit entries on both sides; live cross-repo testing with provider-core deferred to provider-core v2
  3. Protocol version skew is tested: current and previous protocol versions communicate without data loss or silent failures (tested against the conformance harness)
  4. A developer with no prior context can install and use patient-core by following the documentation alone (installation walkthrough, architecture guide, channel protocol spec, CANS.md schema reference)
  5. The architecture guide, channel protocol specification, and contribution guide are complete and accurate against the shipped implementation
**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Plugin Scaffolding and Platform Portability | 0/2 | Planned | - |
| 2. Patient CANS Schema and Activation Gate | 0/0 | Not started | - |
| 3. Audit Pipeline | 0/0 | Not started | - |
| 4. Onboarding and Agent Configuration | 0/0 | Not started | - |
| 5. Consent Engine | 0/0 | Not started | - |
| 6. Secure Channel Protocol | 0/0 | Not started | - |
| 7. Patient Skills and Defense Integration | 0/0 | Not started | - |
| 8. Integration Testing and Documentation | 0/0 | Not started | - |

---

## Coverage Map

Every v1 requirement mapped to exactly one phase. No orphans. No duplicates.

| Requirement | Phase | Description |
|-------------|-------|-------------|
| PLUG-01 | 1 | Plugin manifest |
| PLUG-02 | 1 | Plugin registration via extension API |
| PLUG-03 | 1 | PlatformAdapter abstraction |
| PLUG-04 | 1 | Zero runtime npm dependencies |
| PLUG-05 | 1 | Graceful degradation without hooks |
| PLUG-06 | 4 | `patientagent init` configures dedicated agent + CANS.md |
| PCANS-01 | 2 | Patient CANS.md schema with identity_type: patient |
| PCANS-02 | 2 | Binary activation gate |
| PCANS-03 | 2 | TypeBox schema validation |
| PCANS-04 | 2 | SHA-256 integrity check |
| PCANS-05 | 2 | Malformed CANS.md handling |
| PCANS-06 | 2 | Health context in CANS.md |
| PCANS-07 | 2 | Provider trust list in CANS.md |
| AUDT-01 | 3 | Hash-chained JSONL audit log |
| AUDT-02 | 3 | Action logging with full context |
| AUDT-03 | 3 | Channel message logging with bilateral entries |
| AUDT-04 | 3 | Async buffered writes |
| AUDT-05 | 3 | Background integrity verification |
| AUDT-06 | 3 | Patient-owned audit log |
| ONBD-01 | 4 | 9-stage conversational interview |
| ONBD-02 | 4 | Health literacy levels |
| ONBD-03 | 4 | Review-edit-regenerate loop |
| ONBD-04 | 4 | Workspace supplementation |
| ONBD-05 | 4 | Idempotent updates via HTML comment boundaries |
| ONBD-06 | 4 | `patientagent status` command |
| CSNT-01 | 5 | Deny-by-default sharing posture |
| CSNT-02 | 5 | Per-provider trust list with states |
| CSNT-03 | 5 | Consent gate on outbound Share |
| CSNT-04 | 5 | Data minimization enforcement |
| CSNT-05 | 5 | Always-manual consent action |
| CSNT-06 | 5 | Risk-stratified consent tiers |
| CSNT-07 | 5 | v2-ready consent architecture |
| CHAN-01 | 6 | Patient-core owns channel spec |
| CHAN-02 | 6 | AES-256-GCM with counter-based IVs |
| CHAN-03 | 6 | Bilateral audit entries per interaction |
| CHAN-04 | 6 | Provider identity verification before engagement |
| CHAN-05 | 6 | Consent-gated outbound, trust-validated inbound |
| CHAN-06 | 6 | ChannelMessage envelope with protocol version |
| CHAN-07 | 6 | File-based encrypted mailbox transport |
| CHAN-08 | 6 | Channel spec published as TS types + JSON Schema |
| SKIL-01 | 7 | Share-skill (supervised) |
| SKIL-02 | 7 | Request-skill (autonomous/supervised per config) |
| SKIL-03 | 7 | Review-skill (plain language summaries) |
| SKIL-04 | 7 | Consent-skill (always manual) |
| SKIL-05 | 7 | Skills gate on valid Patient CANS.md |
| SKIL-06 | 7 | Skills respect autonomy tiers |
| SKIL-07 | 7 | Skills ship via plugin.json skills directories |
| DFNS-01 | 7 | Skill-internal two-phase consent flow |
| DFNS-02 | 7 | Data minimization on outbound messages |
| DFNS-03 | 6 | Provider verification (NPI + trust_level) |
| DFNS-04 | 3 | Audit trail chain integrity verification |
| DFNS-05 | 4 | Tool policy allow/deny lists at init time |
| PORT-01 | 1 | PlatformAdapter interface (independent impl) |
| PORT-02 | 1 | Duck-type platform detection |
| PORT-03 | 1 | Platform-specific workspace file profiles |
| PORT-04 | 1 | Three entry points (OpenClaw, standalone, core) |
| AGNT-01 | 4 | Dedicated patientagent workspace |
| AGNT-02 | 4 | Agent routing for provider messages |
| AGNT-03 | 4 | Clinical-safe tool policies per agent |
| AGNT-04 | 4 | Sandbox configuration for agent isolation |
| INTG-01 | 8 | End-to-end flow validation |
| INTG-02 | 8 | Bidirectional patient-core/provider-core communication |
| INTG-03 | 8 | Documentation-driven install and use |
| INTG-04 | 8 | Protocol version skew testing |
| DOCS-01 | 8 | Architecture guide |
| DOCS-02 | 8 | Installation and onboarding walkthrough |
| DOCS-03 | 8 | Channel protocol specification |
| DOCS-04 | 8 | Patient CANS.md schema reference |
| DOCS-05 | 8 | Contribution guide |

**Total: 69/69 requirements mapped. 0 orphans.**

Note: The REQUIREMENTS.md stated 63 total v1 requirements; the actual count from the traceability table is 69. This roadmap covers all 69.

---

## Dependency Graph

```
Phase 1 (Plugin + Platform)
  |
  +---> Phase 2 (CANS + Activation)
  |       |
  |       +---> Phase 4 (Onboarding + Agent Config) [also depends on Phase 3]
  |       |
  |       +---> Phase 5 (Consent Engine)
  |               |
  |               +---> Phase 6 (Channel) [also depends on Phase 3]
  |                       |
  |                       +---> Phase 7 (Skills + Defense)
  |                               |
  |                               +---> Phase 8 (Integration + Docs)
  |
  +---> Phase 3 (Audit Pipeline)
```

Phases 2 and 3 can execute in parallel after Phase 1.
Phase 4 requires both Phase 2 and Phase 3.
Phase 5 requires Phase 2.
Phase 6 requires Phase 3 and Phase 5.
Phase 7 requires Phase 5 and Phase 6.
Phase 8 requires Phase 7.

---

## Provider-Core Alignment

**Provider-core v1 status (as of 2026-02-21):** Phases 1–5 complete (28/28 plans), Phase 6 (Docs) in progress, Phase 7 (Gap Closure) queued. Agent-to-Agent Communication (COMM-01, COMM-02) and Patient CareAgents (PCAG-01, PCAG-02) deferred to provider-core v2.

| patient-core Phase | provider-core Phase | Coordination Point |
|--------------------|--------------------|--------------------|
| Phase 1 (Plugin) | Phase 1-2 (complete) | Same plugin patterns; provider-core is reference implementation |
| Phase 2 (CANS) | Phase 1-2 (complete) | Same TypeBox schema approach; `identity_type` discriminator |
| Phase 3 (Audit) | Phase 1 (complete) | Same hash-chain pattern; bilateral audit correlation format |
| Phase 4 (Onboarding) | Phase 2 (complete) | Same conversational interview pattern; workspace supplementation |
| Phase 5 (Consent) | No direct equivalent | Patient-specific; no provider-core counterpart |
| Phase 6 (Channel) | provider-core v2 (deferred) | Patient-core publishes spec; provider-core v2 builds ChannelAdapter |
| Phase 7 (Skills) | Phase 4 (complete) | Same skill framework patterns (manifest, integrity, loader) |
| Phase 8 (Integration) | provider-core v2 (deferred) | v1: conformance test harness (mock provider); live cross-repo testing deferred to provider-core v2 |

**Key implication:** patient-core v1 integration testing (Phase 8, INTG-02) uses a mock provider conformance harness, not a live provider-core instance. Live bidirectional testing requires provider-core v2's ChannelAdapter.

---
*Last updated: 2026-02-21*
