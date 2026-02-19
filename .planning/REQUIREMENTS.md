# Requirements: @careagent/patient-core

**Defined:** 2026-02-18
**Core Value:** The patient is the ultimate authority over their health information — nothing leaves their workspace without explicit consent, and their agent advocates for their stated preferences at every interaction.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Plugin Foundation (PLUG)

- [ ] **PLUG-01**: Plugin manifest (`openclaw.plugin.json`) declares patient-core with extensions, skills directory, and hook registrations
- [ ] **PLUG-02**: Plugin registers via OpenClaw's extension API on install (CLI commands, hooks, services, skills)
- [ ] **PLUG-03**: PlatformAdapter abstracts all OpenClaw interactions (duck-typed, no direct imports)
- [ ] **PLUG-04**: Zero runtime npm dependencies — all runtime needs from Node.js built-ins, YAML bundled via tsdown
- [ ] **PLUG-05**: Graceful degradation when OpenClaw hooks unavailable (try/catch → degraded status, never crash)
- [ ] **PLUG-06**: `patientagent init` configures dedicated agent entry in `openclaw.json` (workspace, routing, tool policies, sandbox) in addition to generating CANS.md

### Patient CANS Activation (PCANS)

- [ ] **PCANS-01**: Patient CANS.md with `identity_type: patient` declares patient identity, health context, consent preferences, provider trust list, advocacy boundaries
- [ ] **PCANS-02**: CANS.md presence activates patient clinical mode; absence = standard behavior (binary gate, no partial states)
- [ ] **PCANS-03**: TypeBox schema validates all CANS.md fields at parse time
- [ ] **PCANS-04**: SHA-256 integrity check on every CANS.md load; tampered file triggers warning and does not activate
- [ ] **PCANS-05**: Malformed CANS.md = inactive with clear error message (never partially active)
- [ ] **PCANS-06**: Patient health context stored in CANS.md (conditions, medications, allergies, care goals)
- [ ] **PCANS-07**: Provider trust list with NPI, role, and trust_level (active/suspended/revoked) per provider

### Audit Trail (AUDT)

- [ ] **AUDT-01**: Hash-chained JSONL append-only audit log in `.careagent/AUDIT.log`
- [ ] **AUDT-02**: Every patient action (share, request, review, consent) logged with full context
- [ ] **AUDT-03**: Every channel message (inbound and outbound) logged with bilateral audit entries
- [ ] **AUDT-04**: Async buffered writes — audit never blocks patient workflow
- [ ] **AUDT-05**: Background integrity verification service validates hash chain
- [ ] **AUDT-06**: Patient owns and controls the audit log; audit entries log references, not raw health data content

### Onboarding (ONBD)

- [ ] **ONBD-01**: 9-stage conversational interview generates Patient CANS.md (Welcome, Identity, Health Context, Provider Trust List, Communication Prefs, Advocacy Prefs, Consent Defaults, Autonomy Prefs, Review)
- [ ] **ONBD-02**: Plain language, minimal jargon, guided choices at three health literacy levels (simplified, standard, detailed)
- [ ] **ONBD-03**: Review-edit-regenerate loop before finalizing CANS.md
- [ ] **ONBD-04**: Workspace supplementation (SOUL.md, AGENTS.md, USER.md) with patient-specific clinical context
- [ ] **ONBD-05**: Idempotent updates via HTML comment boundaries — existing workspace content preserved, never replaced
- [ ] **ONBD-06**: `patientagent status` shows activation state, CANS.md summary, consent posture, audit stats, and provider trust list

### Consent Engine (CSNT)

- [ ] **CSNT-01**: Deny-by-default sharing posture — nothing leaves workspace without explicit consent verification
- [ ] **CSNT-02**: Per-provider trust list with active/suspended/revoked states; only active providers receive data
- [ ] **CSNT-03**: Consent gate checks every outbound Share action (is provider trusted? is data category permitted? has patient approved?)
- [ ] **CSNT-04**: Data minimization enforced on all outbound messages — agent strips to minimum relevant data set per interaction type
- [ ] **CSNT-05**: Consent action is always manual (hardcoded, not configurable) — agent never consents on patient's behalf
- [ ] **CSNT-06**: Risk-stratified consent tiers to prevent consent fatigue (routine actions grouped/batched, sensitive actions require individual approval)
- [ ] **CSNT-07**: Consent engine architected to accommodate future per-data-category matrix (v2) without rewrite

### Secure Channel (CHAN)

- [ ] **CHAN-01**: Patient-core defines and owns the channel specification; provider-core implements a conforming ChannelAdapter
- [ ] **CHAN-02**: Encrypted message transport using AES-256-GCM with counter-based IVs (not random) via Node.js built-in crypto
- [ ] **CHAN-03**: Bilateral audit entries for every channel interaction (logged on both patient and provider sides)
- [ ] **CHAN-04**: Provider identity verification (NPI + trust_level) before channel engagement
- [ ] **CHAN-05**: Consent-gated outbound messages; trust-validated inbound messages
- [ ] **CHAN-06**: ChannelMessage envelope with protocol version field for forward compatibility
- [ ] **CHAN-07**: File-based encrypted mailbox transport for v1 (satisfies zero-dep, offline-first, CLI-compatible constraints)
- [ ] **CHAN-08**: Channel spec published as documentation artifacts (TypeScript types + JSON Schema) for provider-core integration

### Patient Skills (SKIL)

- [ ] **SKIL-01**: share-skill prepares and transmits health information (supervised — patient reviews before send)
- [ ] **SKIL-02**: request-skill initiates provider requests for appointments, referrals, records, explanations (autonomous/supervised per CANS.md config)
- [ ] **SKIL-03**: review-skill processes and summarizes inbound provider communications in plain language, highlights decisions, flags conflicts with care goals
- [ ] **SKIL-04**: consent-skill manages approval/denial workflow (always manual — patient decides, every decision logged)
- [ ] **SKIL-05**: All skills gate on `identity_type: patient` — refuse to load without valid Patient CANS.md
- [ ] **SKIL-06**: Skills respect CANS.md autonomy tiers (supervised/autonomous/manual per action type)
- [ ] **SKIL-07**: Skills ship via `openclaw.plugin.json` skills directories for automatic loading

### Platform Portability (PORT)

- [ ] **PORT-01**: PlatformAdapter interface independently implemented (same interface as provider-core, no shared code)
- [ ] **PORT-02**: Duck-type platform detection — probe for APIs, never import OpenClaw directly
- [ ] **PORT-03**: Platform-specific workspace file profiles for supplementation
- [ ] **PORT-04**: Three entry points: OpenClaw (plugin), standalone (direct), core (types only)

### Defense Layers (DFNS)

- [ ] **DFNS-01**: Consent gate blocks unauthorized outbound data; implemented as skill-internal two-phase flow (not hook-dependent)
- [ ] **DFNS-02**: Data minimization strips outbound messages to minimum relevant data per interaction type
- [ ] **DFNS-03**: Provider verification validates NPI and trust_level before engagement; stale trust states detected
- [ ] **DFNS-04**: Audit trail provides complete, verifiable interaction history with chain integrity verification
- [ ] **DFNS-05**: Tool policy (allow/deny lists) configured at init time as primary enforcement mechanism

### Dedicated Agent Configuration (AGNT)

- [ ] **AGNT-01**: Dedicated `patientagent` with own workspace (`~/.openclaw/workspace-patientagent/`) containing CANS.md, SOUL.md, AGENTS.md, USER.md, skills/
- [ ] **AGNT-02**: Agent routing configuration — provider messages route to patient's dedicated agent via OpenClaw multi-agent routing
- [ ] **AGNT-03**: Clinical-safe tool policies configured per dedicated agent (allow/deny lists for patient-safe operations)
- [ ] **AGNT-04**: Sandbox configuration for patient agent isolation

### Integration (INTG)

- [ ] **INTG-01**: End-to-end flow: install → onboard → dedicated agent active → provider communication → consent verification → audit trail complete
- [ ] **INTG-02**: Patient-core ↔ provider-core bidirectional communication via secure channel using published spec
- [ ] **INTG-03**: Developer can install and use patient-core by following documentation alone
- [ ] **INTG-04**: Protocol version skew tested (current vs previous protocol versions between patient-core and provider-core)

### Documentation (DOCS)

- [ ] **DOCS-01**: Architecture guide explaining hybrid plugin+agent model, consent engine, defense layers, channel protocol
- [ ] **DOCS-02**: Installation and onboarding walkthrough (from fresh OpenClaw to functional patient agent)
- [ ] **DOCS-03**: Channel protocol specification for provider-core implementors (message format, encryption, signing, transport)
- [ ] **DOCS-04**: Patient CANS.md schema reference with all fields documented
- [ ] **DOCS-05**: Contribution guide

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Consent Granularity

- **CSNT-08**: Per-data-category consent (medications, diagnoses, mental health, substance use)
- **CSNT-09**: Full consent matrix: per-provider x per-action x per-data-category

### Proxy Support

- **PRXY-01**: Caregiver/proxy support with legal authority verification
- **PRXY-02**: Minor patient support with guardian consent requirements

### Production Hardening

- **PROD-01**: Cryptographic integrity for audit log (digital signatures, Merkle trees)
- **PROD-02**: HIPAA compliance implementation
- **PROD-03**: Human-readable audit summary layer
- **PROD-04**: Network transport upgrade (A2A Protocol over HTTPS for production)
- **PROD-05**: Proper key exchange protocol (X25519) replacing pre-shared keys

### Advanced Security

- **SECR-01**: Dual-LLM architecture for review-skill (quarantined LLM for untrusted provider input)
- **SECR-02**: Data egress monitor across all outbound channels
- **SECR-03**: Agent-to-NPI cryptographic binding

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Medical advice or diagnosis | Agent facilitates, never interprets or recommends — liability and Data Sovereignty principle |
| Direct EHR/portal access | Provider's agent handles clinical system interfaces via their side |
| Autonomous health decisions | Consent action hardcoded to manual — agent never decides for patient |
| Bulk data export | Undermines data minimization; share is per-interaction, per-provider, consent-gated |
| Multi-patient/caregiver support | Requires proxy consent, legal authority verification — v2 (PRXY-01, PRXY-02) |
| Insurance/billing optimization | Financial advice liability; agent can share billing docs but not advise |
| Real patient data (PHI) in dev | Synthetic data only; architecture is PHI-ready but handling not implemented |
| Hardcoded LLM provider | Must remain model-agnostic — support whatever OpenClaw supports |
| Network transport (HTTP/A2A) | v1 uses file-based mailbox; production transport is v2 (PROD-04) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLUG-01 | TBD | Pending |
| PLUG-02 | TBD | Pending |
| PLUG-03 | TBD | Pending |
| PLUG-04 | TBD | Pending |
| PLUG-05 | TBD | Pending |
| PLUG-06 | TBD | Pending |
| PCANS-01 | TBD | Pending |
| PCANS-02 | TBD | Pending |
| PCANS-03 | TBD | Pending |
| PCANS-04 | TBD | Pending |
| PCANS-05 | TBD | Pending |
| PCANS-06 | TBD | Pending |
| PCANS-07 | TBD | Pending |
| AUDT-01 | TBD | Pending |
| AUDT-02 | TBD | Pending |
| AUDT-03 | TBD | Pending |
| AUDT-04 | TBD | Pending |
| AUDT-05 | TBD | Pending |
| AUDT-06 | TBD | Pending |
| ONBD-01 | TBD | Pending |
| ONBD-02 | TBD | Pending |
| ONBD-03 | TBD | Pending |
| ONBD-04 | TBD | Pending |
| ONBD-05 | TBD | Pending |
| ONBD-06 | TBD | Pending |
| CSNT-01 | TBD | Pending |
| CSNT-02 | TBD | Pending |
| CSNT-03 | TBD | Pending |
| CSNT-04 | TBD | Pending |
| CSNT-05 | TBD | Pending |
| CSNT-06 | TBD | Pending |
| CSNT-07 | TBD | Pending |
| CHAN-01 | TBD | Pending |
| CHAN-02 | TBD | Pending |
| CHAN-03 | TBD | Pending |
| CHAN-04 | TBD | Pending |
| CHAN-05 | TBD | Pending |
| CHAN-06 | TBD | Pending |
| CHAN-07 | TBD | Pending |
| CHAN-08 | TBD | Pending |
| SKIL-01 | TBD | Pending |
| SKIL-02 | TBD | Pending |
| SKIL-03 | TBD | Pending |
| SKIL-04 | TBD | Pending |
| SKIL-05 | TBD | Pending |
| SKIL-06 | TBD | Pending |
| SKIL-07 | TBD | Pending |
| PORT-01 | TBD | Pending |
| PORT-02 | TBD | Pending |
| PORT-03 | TBD | Pending |
| PORT-04 | TBD | Pending |
| DFNS-01 | TBD | Pending |
| DFNS-02 | TBD | Pending |
| DFNS-03 | TBD | Pending |
| DFNS-04 | TBD | Pending |
| DFNS-05 | TBD | Pending |
| AGNT-01 | TBD | Pending |
| AGNT-02 | TBD | Pending |
| AGNT-03 | TBD | Pending |
| AGNT-04 | TBD | Pending |
| INTG-01 | TBD | Pending |
| INTG-02 | TBD | Pending |
| INTG-03 | TBD | Pending |
| INTG-04 | TBD | Pending |
| DOCS-01 | TBD | Pending |
| DOCS-02 | TBD | Pending |
| DOCS-03 | TBD | Pending |
| DOCS-04 | TBD | Pending |
| DOCS-05 | TBD | Pending |

**Coverage:**
- v1 requirements: 63 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 63

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after initial definition*
