# Research Summary

**Project:** @careagent/patient-core
**Synthesized:** 2026-02-18
**Research files synthesized:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

`@careagent/patient-core` is a patient-facing clinical AI agent plugin that gives patients structural ownership of their health data: what gets shared, with whom, when, and on what terms. The research is consistent across all four domains -- the product must be built as a mirror of `@careagent/provider-core` in toolchain, structure, and philosophy, extended with three patient-specific subsystems: a **consent engine** (deny-by-default outbound control), a **secure communication channel** (patient-owned protocol), and a **defense stack** oriented around data sovereignty. Every major implementation decision flows from one principle: the patient agent is an advocate, not a proxy. It never makes health decisions, never consents on behalf of the patient, and never shares data without explicit authorization.

The recommended approach is a strict five-phase build sequence driven by dependency analysis. The activation gate and audit trail are foundational and must precede everything. Onboarding and the consent engine come next and can partially parallelize. The channel protocol is the most architecturally significant open question -- the file-based encrypted mailbox approach is the right v1 choice, designed around a `Transport` interface so an A2A-compliant implementation can replace it in production without changing the skill layer. The four atomic skills (Share, Request, Review, Consent) are built last, after their infrastructure is solid. Differentiation features (advocacy engine, health literacy adaptation, patient rights awareness) form a Phase 5 that delivers competitive advantage without blocking the critical path.

The dominant risk in this system is not technical -- it is security. Four pitfalls are rated CRITICAL, all of them consent or data exfiltration related: LLM context leakage bypassing the consent gate, cross-agent prompt injection via inbound provider messages, AES-GCM IV reuse destroying encryption integrity, and OpenClaw's hook system not supporting async consent approval flows. These are not edge cases; they represent the central security property of the product. Every phase must design against them from day one. The consent gate cannot be the only enforcement point, keys can never enter LLM context, and inbound provider messages must be processed by a quarantined LLM instance that has no access to outbound skills or patient health context.

---

## Key Findings

### From STACK.md

**Core technologies (all match provider-core exactly):**

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | >=22.12.0 | Runtime; built-in `crypto.subtle` covers all encryption needs |
| TypeScript | ~5.7.0 | Language; must not diverge from provider-core's version |
| pnpm | >=10.0.0 | Package manager; v10 blocks install scripts by default (supply chain security) |
| tsdown | ~0.20.0 | Bundler; bundles `yaml` so runtime has zero npm deps |
| vitest | ~4.0.0 | Test framework |
| @sinclair/typebox | ~0.34.0 | Schema validation; shared with OpenClaw, generates both JSON Schema and TypeScript types |
| yaml | ^2.8.2 | YAML parser; bundled, not a runtime dep |
| @medplum/fhirtypes | ~5.0.0 | FHIR R4 types; dev-only |
| openclaw | >=2026.1.0 | Plugin host; optional peer dep |

**Critical findings:**
- Zero runtime npm dependencies is achievable. Node.js 22's `crypto.subtle` provides X25519 key agreement, Ed25519 signing, AES-256-GCM encryption, and SHA-256 hashing -- all Stability 2 in v22.13.0+. No crypto library needed.
- Encryption algorithm selection is HIGH confidence: X25519 (key agreement) + AES-256-GCM (authenticated encryption) + Ed25519 (signing). This is the Signal/WireGuard/TLS 1.3 stack.
- TypeScript must be pinned to ~5.7.0. Diverging versions between ecosystem packages creates type compatibility failures.
- `@careagent/provider-core` must NOT be a dependency. Shared concepts are independently implemented.

### From FEATURES.md

**Table stakes (must ship in v1):**

| Feature | Complexity | Critical Path Position |
|---------|-----------|----------------------|
| CANS.md Schema + Activation Gate (TS-2) | Medium | First; everything depends on it |
| Hash-Chained Audit Trail (TS-4) | Medium | First; must precede all action-producing components |
| 9-Stage Onboarding Interview (TS-3) | High | Second; generates CANS.md |
| Workspace Supplementation (TS-11) | Low | Second; completes onboarding |
| Deny-by-Default Consent Gate (TS-1) | Medium | Second; core trust mechanism |
| Provider Verification (TS-5) | Low-Medium | Third; gates channel engagement |
| Share Skill / Supervised Data Release (TS-6) | High | Fourth; most sensitive action |
| Data Minimization (TS-7) | Medium-High | Fourth; applied before channel |
| Request Skill (TS-8) | Medium | Fourth; most common interaction |
| Review Skill / Plain-Language Summaries (TS-9) | Medium | Fourth; inbound processing |
| Consent Skill / Always-Manual (TS-10) | Medium | Fourth; hardcoded to manual |

**Differentiators (competitive advantage, still v1):**
- Secure Agent-to-Agent Channel (D-1) -- patient-owned protocol spec; architectural innovation
- Configurable Autonomy Tiers per Action (D-2) -- share/request/review have variable autonomy; consent is always manual
- Advocacy + Escalation Engine (D-3) -- active boundary enforcement; transforms passive gatekeeper into active advocate
- Health Literacy-Adaptive Communication (D-4) -- three tiers: simplified/standard/detailed
- Patient Rights Awareness (D-5) -- contextual HIPAA/21st Century Cures Act rights surfacing
- Notification Preferences (D-6) -- immediate/summary/batched notification timing

**Explicit anti-features (do not build):**
- Medical advice or diagnosis
- Direct EHR/portal access (agent-to-agent only, not agent-to-system)
- Autonomous health decisions (Consent is hardcoded manual)
- Bulk data export
- Multi-patient/caregiver proxy support (v2+ with separate regulatory analysis)
- Per-data-category consent matrix (v2+ as CSNT-06/CSNT-07)

### From ARCHITECTURE.md

**Major components and responsibilities:**

| Component | Responsibility |
|-----------|---------------|
| Activation Gate | Parse CANS.md, validate TypeBox schema, SHA-256 integrity, binary activate/deactivate |
| Consent Engine | Deny-by-default rule evaluation, per-provider trust management, ConsentGate.evaluate() |
| Defense Stack | Ordered layer pipeline: Consent Gate > Data Minimizer > Provider Verifier > Audit Trail |
| Channel Manager | Envelope formatting, encryption, signing, transport abstraction, channel protocol ownership |
| Skill Layer | Four atomic actions (Share, Request, Review, Consent) with BaseSkill template and autonomy tier enforcement |
| Audit Pipeline | Hash-chained JSONL, append-only, async buffered writes, bilateral audit correlation |
| Onboarding Engine | 9-stage interview state machine, CANS.md generation, workspace supplementation |
| Platform Adapter | Translate between patient-core and host (OpenClaw, standalone) |

**Key patterns to follow:**
1. **Activation Gate with type discriminator** -- `identity_type: 'patient'` prevents cross-plugin CANS.md confusion; mirrors provider-core exactly
2. **Defense Stack as ordered layer pipeline** -- mirrors provider-core's `HardeningStack`; enables `careagent status` to report defense posture
3. **BaseSkill template method** -- all skills implement `preparePayload()` and `getAutonomyTier()`; consent check is built into the base class
4. **Entry point separation** -- `openclaw.ts` / `standalone.ts` / `core.ts`; identical to provider-core
5. **Transport interface abstraction** -- `ChannelManager` accepts any `ChannelTransport`; v1 uses `FileTransport`, v2 upgrades to `A2ATransport` without skill layer changes

**Secure channel decision:** File-based encrypted mailbox protocol for v1. Patient controls inbox/outbox directories. Messages are persisted as files (offline-resilient, auditable, patient-inspectable). `ChannelMessage` envelope designed to be A2A-forward-compatible. Transport interface enables clean upgrade path.

**Integration model:** Patient-core publishes the channel spec (ChannelMessage JSON Schema, EncryptedEnvelope format, bilateral audit entry format). Provider-core implements a `ChannelAdapter` that conforms to the spec. Zero shared code. No npm dependency between packages.

**Anti-patterns identified:**
- No shared package between patient-core and provider-core (creates coupling; the code is small enough to independently implement)
- ChannelManager must not be a singleton (injectable, not global)
- Consent rules must not live in skill code (centralized in ConsentEngine)
- Audit writes must be async buffered (not synchronous appendFileSync)

### From PITFALLS.md

**Top pitfalls with prevention strategies:**

| # | Pitfall | Severity | Phase | Prevention |
|---|---------|----------|-------|------------|
| 1 | Consent gate bypass via LLM context leakage | CRITICAL | Phase 1+4 | Dual-LLM / context minimization; structured output; data egress monitor on all outbound tool calls |
| 2 | Consent fatigue rendering deny-by-default meaningless | CRITICAL | Phase 2 | Risk-stratified consent tiers from day one; symmetric approve/deny UX; consent analytics |
| 3 | AES-GCM IV reuse destroying encryption | CRITICAL | Phase 3 | Counter-based IV (not random); key rotation threshold; keys never in LLM context |
| 4 | Cross-agent prompt injection via inbound provider messages | CRITICAL | Phase 3+4 | Quarantined LLM for inbound Review; structured message schema; tool access restriction during Review |
| 5 | Hook dependency for async consent approval (OpenClaw limitation) | CRITICAL | Phase 1 | Never depend on `before_tool_call` for consent approval; consent as skill-internal two-phase operation; hooks as backstop only |
| 6 | Data minimization rules breaking clinical functionality | MAJOR | Phase 2+4 | Whitelist model per interaction type; context-aware (not category-based) minimization; clinical scenario test fixtures |
| 7 | Provider verification works in dev but fails in production | MAJOR | Phase 1+3 | Separate identity verification from authorization; cryptographic handshake during trust establishment; `synthetic_data_only` guard |
| 8 | Protocol version skew between patient-core and provider-core | MAJOR | Phase 3+5 | `protocol_version` field in every message; backward-compatible minor versions; version negotiation handshake |
| 9 | Audit trail performance degradation as log grows | MAJOR | Phase 1 | Checkpoint snapshots (Merkle root); background verification only; log rotation with chain continuity |
| 10 | Onboarding generating incomplete or inaccurate CANS.md | MAJOR | Phase 2 | Never hallucinate clinical details; mark `source: "patient_reported"`; TypeBox validation before save |

**Phase-specific warnings (compressed):**
- **Phase 1:** Hook limitations (Pitfall 5), CANS integrity caching (Pitfall 13), audit log plaintext data (Pitfall 12), VPS environment (Pitfall 17)
- **Phase 2:** Consent fatigue (Pitfall 2), CANS hallucination (Pitfall 10), jargon creep (Pitfall 16), workspace conflicts (Pitfall 14), stale trust states (Pitfall 15)
- **Phase 3:** IV reuse (Pitfall 3), protocol versioning (Pitfall 8), provider identity gap (Pitfall 7), offline behavior (Pitfall 11)
- **Phase 4:** Context leakage (Pitfall 1), prompt injection (Pitfall 4), minimization over-stripping (Pitfall 6)
- **Phase 5:** Version skew (Pitfall 8), schema drift (Pitfall 18), trust state races (Pitfall 15)

---

## Implications for Roadmap

### Recommended Phase Structure

The feature dependency chain, architectural build order, and pitfall phase assignments all converge on the same five-phase structure. These are not arbitrary groupings -- they are forced by hard dependencies.

**Phase 1: Plugin Foundation**

Rationale: Activation gate and audit pipeline must exist before any component that produces events or requires a patient context. This is the same foundation that provider-core built in its Phase 1-2. Pitfall 5 (hook limitation) and Pitfall 9 (audit performance) must be designed around here -- retrofitting is expensive.

Delivers:
- TypeScript project scaffolding (package.json, tsconfig, tsdown, vitest, lint)
- Entry points: `openclaw.ts`, `standalone.ts`, `core.ts`
- Patient CANS.md TypeBox schema (full, with all sections including providers/consent/advocacy/autonomy)
- Activation gate (parse, validate, integrity, discriminate)
- Audit pipeline (hash-chained JSONL, async buffered writes, checkpoint snapshots, session management)
- Platform adapter (OpenClaw + standalone implementations)
- TypeBox schema exports for channel protocol (provider-core can start reading the spec)

Features: TS-2 (activation gate), TS-4 (audit trail)
Pitfalls to design against: 5, 9, 12, 13, 17
Research flag: STANDARD PATTERNS -- provider-core's Phase 1-2 is a direct reference implementation.

---

**Phase 2: Onboarding and Consent Engine**

Rationale: Onboarding generates CANS.md (the input for all subsequent phases). The consent engine has no dependency on the channel -- it evaluates rules in memory from CANS.md. These two can parallelize internally. The consent engine's risk stratification tiers must be designed here; retrofitting after Phase 4 is a complete rewrite. Pitfall 2 (consent fatigue) is a design-time decision, not a runtime fix.

Delivers:
- 9-stage conversational onboarding interview (readline/promises, plain language prompts, health literacy tiers)
- CANS.md generation with `source: "patient_reported"` markers, TypeBox validation before save, never-hallucinate constraint
- Workspace supplementation (SOUL.md, AGENTS.md, USER.md with HTML comment boundaries)
- Consent engine: deny-by-default evaluator, risk-stratified tiers, per-provider trust management, ConsentGate interface
- Data minimization rule format (whitelist model per interaction type; context-aware, not category-based)
- Trust state management + event system for revocation propagation

Features: TS-3 (onboarding), TS-11 (workspace supplementation), TS-1 (consent gate), TS-7 (data minimization design), D-2 (autonomy tiers)
Pitfalls to design against: 2, 10, 14, 15, 16
Research flag: NEEDS RESEARCH -- the 9-stage interview flow, plain-language prompt templates at three health literacy levels, and the risk stratification tier definitions for the consent engine are implementation details not fully specified in the PRD.

---

**Phase 3: Secure Channel Protocol**

Rationale: The channel is the integration backbone. Skills cannot function without it. Provider-core must begin its ChannelAdapter implementation once the spec is published -- so the spec artifact (`channel/types.ts` as JSON Schema) should be the first output of this phase. Key management (Pitfall 3) and prompt injection schema validation (Pitfall 4) must be designed in this phase. Protocol versioning (Pitfall 8) is a day-one design decision.

Delivers:
- ChannelMessage envelope (TypeScript interface + TypeBox schema exported as JSON Schema)
- EncryptedEnvelope format (AES-256-GCM, counter-based IV, Ed25519 sender signature)
- Transport interface abstraction (`ChannelTransport`)
- FileTransport v1 implementation (inbox/outbox directories, polling, file persistence)
- Key management: X25519 key generation during onboarding, Ed25519 signing keypairs, HKDF key derivation, counter-based IV, key rotation threshold, keys isolated from LLM context
- Provider verification: NPI trust list check + cryptographic handshake (out-of-band key exchange), `synthetic_data_only` guard
- Protocol versioning: `protocol_version: "1.0"` in every message, version negotiation handshake
- Offline behavior: explicit states (`unreachable`, `queued`, `retry_exhausted`), 50-message / 72-hour queue limits, patient notification on expiry
- Channel spec publication (ChannelMessage JSON Schema, EncryptedEnvelope format, bilateral audit entry format) for provider-core consumption

Features: D-1 (secure channel), TS-5 (provider verification), partial D-2 (autonomy enforcement)
Pitfalls to design against: 3, 7, 8, 11, 18
Research flag: NEEDS RESEARCH -- the exact key exchange ceremony for trust establishment, the out-of-band key distribution mechanism for v1 synthetic data testing, and the A2A upgrade path compatibility validation all require Phase 3 research before implementation.

---

**Phase 4: Patient Skills**

Rationale: All four skills depend on the channel (Phase 3), consent engine (Phase 2), and audit pipeline (Phase 1). The skills are the user-visible product. Context leakage (Pitfall 1) and cross-agent prompt injection (Pitfall 4) are Phase 4 implementation concerns, but the dual-LLM architecture that prevents them must be provisioned in Phase 3 (Review skill's quarantined LLM instance). Share is the most sensitive skill and should be built first to establish the security pattern; the other three follow.

Delivers:
- BaseSkill template (autonomy tier check, consent gate call, channel send, audit log)
- Share Skill: two-phase operation (prepare + patient approval + transmit), data minimization applied, supervised default
- Request Skill: four request types (appointment, referral, records, clarification), autonomy-tier-configurable
- Review Skill: quarantined LLM instance for inbound processing, structured schema validation before LLM, tool access restriction during Review, plain-language summarization at configured literacy level
- Consent Skill: always-manual (hardcoded), plain-language consent request explanation, bilateral logging
- Data egress monitor: pattern-match all outbound content against patient health context regardless of skill origin
- Trust re-verification at Share transmission time (not just preparation time)

Features: TS-6 (Share), TS-7 (data minimization applied), TS-8 (Request), TS-9 (Review), TS-10 (Consent)
Pitfalls to design against: 1, 4, 6, 15
Research flag: STANDARD PATTERNS -- the BaseSkill template and skill structures are fully specified in ARCHITECTURE.md. No additional research phase needed.

---

**Phase 5: Differentiation + Integration Testing**

Rationale: Differentiation features (advocacy engine, health literacy adaptation, patient rights awareness, notification preferences) deliver competitive value but have no blocking dependencies from the critical path. Integration testing with provider-core must test current-against-previous protocol versions (Pitfall 8) and validate shared message fixtures (Pitfall 18). Both patient-core and provider-core should be integration-testable independently against fixtures before running end-to-end.

Delivers:
- Advocacy + Escalation Engine: configurable triggers, `block_and_notify` vs `warn_and_proceed` escalation actions, patient rights awareness mode
- Health literacy adaptation: three-tier language adjustment (simplified/standard/detailed) applied to all patient-facing output
- Patient Rights Awareness: contextual HIPAA/21st Century Cures Act rights surfacing in Review and Consent skills
- Notification Preferences: immediate/summary/batched notification timing
- Integration test suite: message exchange with synthetic data, bilateral audit verification, version skew tests (v1.0 against v1.x), schema drift validation with shared JSON Schema fixtures
- Protocol spec changelog for provider-core coordination

Features: D-3 (advocacy), D-4 (health literacy), D-5 (patient rights), D-6 (notification preferences)
Pitfalls to design against: 8, 18
Research flag: STANDARD PATTERNS for differentiation features. Integration testing design may benefit from brief research into bilateral audit cross-log verification tooling.

---

### Feature-to-Phase Mapping

| Feature | Phase | Priority |
|---------|-------|----------|
| CANS.md Schema + Activation Gate (TS-2) | 1 | Foundational |
| Audit Trail (TS-4) | 1 | Foundational |
| 9-Stage Onboarding (TS-3) | 2 | Critical path |
| Workspace Supplementation (TS-11) | 2 | Critical path |
| Consent Gate (TS-1) | 2 | Critical path |
| Data Minimization design (TS-7) | 2 | Critical path |
| Secure Channel (D-1) | 3 | Integration backbone |
| Provider Verification (TS-5) | 3 | Security gate |
| Share Skill (TS-6) | 4 | Core feature |
| Data Minimization applied (TS-7) | 4 | Core feature |
| Request Skill (TS-8) | 4 | Core feature |
| Review Skill (TS-9) | 4 | Core feature |
| Consent Skill (TS-10) | 4 | Core feature |
| Advocacy Engine (D-3) | 5 | Differentiator |
| Health Literacy Adaptation (D-4) | 5 | Differentiator |
| Patient Rights Awareness (D-5) | 5 | Differentiator |
| Notification Preferences (D-6) | 5 | Differentiator |

---

### Research Flags

| Phase | Research Flag | Reason |
|-------|---------------|--------|
| Phase 1 | STANDARD | Provider-core Phase 1-2 is a direct reference. Activation gate, audit pipeline, entry points are documented. |
| Phase 2 | NEEDS RESEARCH | 9-stage interview prompt templates at three health literacy levels; risk-stratified consent tier thresholds; minimization whitelist definitions per interaction type need domain expert input |
| Phase 3 | NEEDS RESEARCH | Key exchange ceremony mechanics for v1 file-based transport; out-of-band key distribution UX; A2A upgrade path compatibility specifics |
| Phase 4 | STANDARD | BaseSkill template and dual-LLM pattern are fully specified. Implementation follows documented patterns. |
| Phase 5 | STANDARD | Differentiation features are well-specified. Integration testing design follows standard cross-repo contract testing. |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| **Stack** | HIGH | Fully constrained by provider-core compatibility. All versions verified against npm registry on 2026-02-18. Zero ambiguity. |
| **Features** | HIGH | Derived from PRD + regulatory requirements (HIPAA, 21st Century Cures Act) + CHI 2024 patient autonomy research. Table stakes are non-negotiable. Differentiators are well-motivated. |
| **Architecture** | HIGH (overall) / MEDIUM (channel transport) | Component boundaries and patterns are HIGH confidence (direct provider-core code analysis + PRD). Channel transport mechanism is MEDIUM -- file-based approach is well-reasoned but novel for this context. A2A compatibility is forward-looking. |
| **Pitfalls** | HIGH | All CRITICAL pitfalls are sourced from official security research (OWASP, JAMA, arxiv), Node.js docs, and provider-core lived experience (OpenClaw issues #6535, #19072). MEDIUM confidence only on production NPI-to-agent identity binding (emerging standards area). |

**Gaps requiring attention during planning:**

1. **Channel transport for v1 file-based exchange:** The file mailbox approach assumes a shared filesystem or manual file transfer for demos. How exactly will two agents on separate machines exchange messages in v1? This needs a concrete answer before Phase 3 implementation begins. Options: shared network mount, manual copy, ephemeral sync mechanism.

2. **Onboarding prompt templates:** The 9 onboarding stages are defined in FEATURES.md but the actual prompt content -- tested at simplified/standard/detailed health literacy levels -- does not exist yet. These need to be written and validated against plain-language guidelines before Phase 2 implementation. This is clinical UX work, not just engineering.

3. **Risk stratification thresholds for consent tiers:** Pitfall 2 prevention requires classifying data categories by sensitivity level (routine vs. sensitive vs. highly sensitive). This classification has regulatory implications (42 C.F.R. Part 2 for substance use, state mental health privacy laws). The classification scheme needs input beyond what the current research covers.

4. **Trust establishment ceremony UX:** The cryptographic key exchange between patient and provider at trust establishment time requires a user-facing workflow. What does the patient actually do to add a provider to their trust list? This touches both Phase 2 (CANS.md trust list section) and Phase 3 (key exchange mechanics) and needs a concrete flow before either phase begins.

5. **Consent Skill bilateral flow timing:** When a provider sends a consent request and the patient approves, what is the expected latency? If the provider agent is polling for responses (file transport), the delay could be minutes to hours. How does this affect clinical workflows that depend on timely consent? This is a product question that informs both channel design and the UX of the Consent skill.

---

## Sources (Aggregated)

### Official Documentation and Standards
- [Node.js v22 Web Crypto API](https://nodejs.org/docs/latest-v22.x/api/webcrypto.html)
- [Node.js v22 Crypto Module](https://nodejs.org/docs/latest-v22.x/api/crypto.html)
- [OpenClaw Plugin Documentation](https://docs.openclaw.ai/tools/plugin)
- [FHIR Consent Resource (HL7)](https://build.fhir.org/consent.html)
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [HIPAA Minimum Necessary Requirement (HHS.gov)](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html)
- [NPPES NPI Registry API (HHS.gov)](https://npiregistry.cms.hhs.gov/api-page)
- [ONC Information Blocking](https://healthit.gov/information-blocking/)
- [21st Century Cures Act / TEFCA](https://www.federalregister.gov/documents/2024/12/16/2024-29163/health-data-technology-and-interoperability-trusted-exchange-framework-and-common-agreement-tefca)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [HHS ODPHP Health Literacy Online](https://odphp.health.gov/healthliteracyonline/create-actionable-content/write-plain-language)
- [CDC Plain Language Materials](https://www.cdc.gov/health-literacy/php/develop-materials/plain-language.html)

### Peer-Reviewed and Security Research
- [LLM Vulnerability to Prompt Injection in Medical Advice (JAMA Network Open)](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2842987) -- 94.4% attack success rate
- [Design Patterns for Securing LLM Agents (arxiv 2506.08837)](https://arxiv.org/html/2506.08837v2)
- [Security Threat Modeling for AI-Agent Protocols (arxiv 2602.11327)](https://arxiv.org/html/2602.11327)
- [Efficient Data Structures for Tamper-Evident Logging (Crosby, USENIX 2009)](https://static.usenix.org/event/sec09/tech/full_papers/crosby.pdf)
- [Patient Preferences for AI Autonomy (CHI 2024)](https://dl.acm.org/doi/10.1145/3613904.3642883)
- [Self-Sovereign Identity for Health Data (Nature Digital Medicine)](https://www.nature.com/articles/s41746-025-01945-z)
- [Patient Consent Preferences (JMIR, 2023)](https://www.jmir.org/2023/1/e42507)
- [Enabling Secure Health Data Sharing (npj Digital Medicine, 2025)](https://www.nature.com/articles/s41746-025-01945-z)
- [AuditableLLM Hash-Chain Audit Framework](https://www.mdpi.com/2079-9292/15/1/56)

### Regulatory and Market Context
- [California AI Medical Chat Guardrails (SB 243 / AB 489)](https://healthtechmagazine.net/article/2026/01/california-adds-guardrails-ai-powered-medical-chats)
- [Healthcare AI and Patients 2026 Predictions](https://www.healthcareittoday.com/2026/01/14/healthcare-ai-and-patients-2026-health-it-predictions/)
- [Patient Engagement Solutions Market](https://www.openpr.com/news/4388330/patient-engagement-solutions-market-cagr-7-12-2025-2035)

### Internal Sources
- Provider-core source code (direct analysis) -- HIGH confidence on architecture patterns
- OpenClaw Issue #6535 (hook wiring gap) -- HIGH confidence, verified and resolved
- OpenClaw Issue #19072 (pause/resume limitation) -- HIGH confidence, confirmed active
- Patient-core PRD (`patient-core-PRD.md`) -- HIGH confidence, primary requirements source
