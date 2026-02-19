# Feature Landscape

**Domain:** Patient-facing clinical AI agent / health data advocacy system
**Project:** @careagent/patient-core
**Researched:** 2026-02-18
**Overall confidence:** HIGH (features derived from PRD + market research + regulatory requirements)

---

## Table Stakes

Features users expect. Missing = product feels incomplete or untrustworthy.

### TS-1: Consent Gate (Deny-by-Default Outbound Control)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Core trust contract. Patients will not use a health data agent unless they are confident nothing leaves without their say-so. HIPAA minimum necessary rule and 21st Century Cures Act both enforce patient control. Every competitor and regulatory framework mandates this. |
| **Complexity** | Medium |
| **Dependencies** | Patient CANS.md (consent section), Audit Trail |
| **Provider-core coordination** | None -- purely patient-side gate. Provider-core only sees what passes through. |
| **Implementation notes** | Check every outbound Share action against consent model: is provider trusted? Is trust_level "active"? Has patient approved this specific disclosure? Three checks, all must pass. Block and notify on failure. |

### TS-2: Patient CANS.md Activation Gate

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Binary activation is the architectural contract. Without CANS, agent is generic. With CANS, agent becomes patient-specific clinical advocate. Same pattern as provider-core -- users will expect consistency across the CareAgent ecosystem. |
| **Complexity** | Medium |
| **Dependencies** | TypeBox schema, SHA-256 integrity check, YAML parser |
| **Provider-core coordination** | Independent implementation, but mirrors provider-core's activation architecture. Schema structure is analogous (identity_type: patient vs. provider). |
| **Implementation notes** | Parse YAML frontmatter, validate against TypeBox schema, SHA-256 integrity on every load. Malformed = inactive (never partially active). |

### TS-3: Conversational Onboarding Interview (9-Stage)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Without onboarding, no CANS.md. Without CANS.md, no activated agent. This is the entry point for the entire product. Research shows conversational intake dramatically outperforms form-based approaches for patient engagement -- progressive disclosure, one step at a time, plain language, reduced anxiety. |
| **Complexity** | High |
| **Dependencies** | CANS.md schema (defines what to collect), workspace supplementation |
| **Provider-core coordination** | None -- patient-side only. Mirrors provider-core's onboarding pattern but with patient-specific stages. |
| **Implementation notes** | 9 stages: Welcome, Identity, Health Context, Provider Trust List, Communication Preferences, Advocacy Preferences, Consent Defaults, Autonomy Preferences, Review. Must support review-edit-regenerate loop. Plain language throughout. Health literacy level should be configurable (standard/detailed/simplified). |

### TS-4: Hash-Chained Audit Trail (Patient-Owned)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | HIPAA Security Rule (45 C.F.R. 164.312(b)) mandates audit controls. Patients need a verifiable record of every action taken on their behalf -- this is the "receipt book." Immutable logging using SHA-2 hashing aligns with NIST FIPS 180-4 and ONC recommendations. Without this, the product cannot credibly claim data sovereignty. |
| **Complexity** | Medium |
| **Dependencies** | None (foundational -- other features depend on it) |
| **Provider-core coordination** | Bilateral audit entries for channel interactions (CHAN-03). Both sides log the same event independently. Format compatible but independently implemented. |
| **Implementation notes** | Hash-chained JSONL, append-only, async buffered writes. Patient-specific event types: share_prepared/approved/sent/blocked, request_initiated/sent/response_received, review_received/summarized/acknowledged, consent_requested/approved/denied, provider_verified/failed, channel events, escalation events. 6-year retention per HIPAA. |

### TS-5: Provider Verification (NPI + Trust Level)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Prevents impersonation attacks. If a patient agent talks to unverified entities, the entire trust model collapses. CMS NPPES registry provides a free, authoritative API for NPI validation. Trust_level management (active/suspended/revoked) gives patients runtime control over which providers can engage. |
| **Complexity** | Low-Medium |
| **Dependencies** | CANS.md provider trust list, channel (gating inbound connections) |
| **Provider-core coordination** | Provider-core must present verifiable NPI credentials that patient-core can check. Verification is patient-initiated -- the patient agent validates, the provider agent proves. |
| **Implementation notes** | Check NPI against CANS.md provider list. Verify trust_level is "active" before engagement. In production, could validate against NPPES API (https://npiregistry.cms.hhs.gov/api). In dev/synthetic, validate against the patient's declared trust list. |

### TS-6: Share Skill (Supervised Data Release)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | This is the first of four atomic actions and the most sensitive. Patients must be able to share specific health information with specific providers on their own terms. "Supervised" means the agent prepares what to share, but the patient reviews and approves before send. This is non-negotiable for trust. |
| **Complexity** | High |
| **Dependencies** | Consent gate (TS-1), data minimization (TS-7), provider verification (TS-5), secure channel (D-1), audit trail (TS-4) |
| **Provider-core coordination** | Outbound Share corresponds to inbound data receipt on provider-core side. Provider agent must understand the message format defined by patient-core's channel spec. |
| **Implementation notes** | Read patient health context from CANS.md, apply data minimization rules, present prepared payload to patient for review, transmit via secure channel on approval, log full cycle to audit trail. |

### TS-7: Data Minimization

| Aspect | Detail |
|--------|--------|
| **Why Expected** | HIPAA Minimum Necessary Rule requires sharing only the minimum PHI needed for a given purpose. This is both a legal requirement and a core trust feature. An appointment request should not send the full medication list. A billing review should not include the clinical narrative. |
| **Complexity** | Medium-High |
| **Dependencies** | CANS.md health context, action type context |
| **Provider-core coordination** | None -- applied before data reaches the channel. Provider-core receives already-minimized data. |
| **Implementation notes** | Map action types to required data categories. Strip outbound messages to minimum relevant fields. Example rules: appointment_request needs only {patient_name, dob, reason_for_visit}; referral_request adds {relevant_conditions, current_medications}. Rules should be extensible. |

### TS-8: Request Skill (Autonomous/Supervised Provider Requests)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Patients need to initiate appointments, referrals, record requests, and ask questions of their providers. This is the most common patient-provider interaction and the primary "care coordination" value. Configurable autonomy: routine requests can be autonomous, sensitive ones supervised. |
| **Complexity** | Medium |
| **Dependencies** | Provider verification (TS-5), secure channel (D-1), consent gate (for any data attached to request), audit trail (TS-4), CANS.md autonomy preferences |
| **Provider-core coordination** | Request messages map to actions the provider agent can handle. Provider-core must have a mechanism to receive and route these requests (appointment scheduling, referral processing, record retrieval). |
| **Implementation notes** | Request types: appointment, referral, records, clarification. Autonomy tier from CANS.md determines whether patient must approve before send. Even autonomous requests are audit-logged. |

### TS-9: Review Skill (Plain-Language Provider Communication Summaries)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Patients receive treatment plans, order notifications, and documentation from providers. Most of this is written in clinical language patients cannot easily parse. The review skill translates it to plain language at the patient's configured health_literacy level. Research shows AI can produce plain-language summaries effectively, but must avoid oversimplification. |
| **Complexity** | Medium |
| **Dependencies** | Secure channel (D-1, to receive inbound), CANS.md communication preferences (health_literacy level), audit trail (TS-4) |
| **Provider-core coordination** | Provider-core sends treatment plans, orders, and documentation through the channel. Review skill processes whatever arrives. Format must be defined in the channel spec. |
| **Implementation notes** | Receive inbound from provider agent. Summarize at appropriate literacy level. Highlight key decisions the patient needs to make. Flag anything conflicting with stated care goals. Present to patient. |

### TS-10: Consent Skill (Always-Manual Approval Workflow)

| Aspect | Detail |
|--------|--------|
| **Why Expected** | The hardest constraint in the system: the agent never consents on the patient's behalf. When a provider requests authorization (for a procedure, treatment plan, data release), the patient agent presents the request, explains what is being asked in plain language, and the patient decides. Every consent decision is logged with full context. |
| **Complexity** | Medium |
| **Dependencies** | Secure channel (D-1, to receive consent requests), review skill (TS-9, for plain-language explanation), audit trail (TS-4), CANS.md |
| **Provider-core coordination** | Provider-core sends consent requests through the channel. Patient-core presents them. Consent responses flow back. Both sides log the decision. This is the most tightly coupled interaction between the two systems. |
| **Implementation notes** | Always manual -- this is hardcoded, not configurable through CANS.md autonomy settings. Present request with full context. Explain what the provider is asking in plain language. Record approval/denial with timestamp, context, and rationale if provided. |

### TS-11: Workspace Supplementation

| Aspect | Detail |
|--------|--------|
| **Why Expected** | Same pattern as provider-core: after onboarding, patient-core additively supplements OpenClaw workspace files (SOUL.md, AGENTS.md, USER.md) with patient-specific context. This is how the LLM host "knows" the patient. Without this, the agent does not carry patient context between interactions. |
| **Complexity** | Low |
| **Dependencies** | Onboarding (TS-3, generates the content to supplement), PlatformAdapter |
| **Provider-core coordination** | None -- patient-side workspace only. |
| **Implementation notes** | HTML comment boundaries for idempotent updates. Must handle update-in-place (re-onboarding) and initial placement. Platform-specific file profiles (OpenClaw, AGENTS.md standard, CLAUDE.md). |

---

## Differentiators

Features that set patient-core apart. Not universally expected, but deliver significant competitive value.

### D-1: Secure Agent-to-Agent Communication Channel (Patient-Owned)

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | This is the architectural innovation. Patient-core defines and owns the channel specification -- the provider agent must conform to the patient's terms, not the other way around. No competitor in the health advocacy space gives patients control over the communication protocol itself. This is the structural expression of data sovereignty. |
| **Complexity** | High |
| **Dependencies** | Provider verification (TS-5), consent gate (TS-1), audit trail (TS-4), data minimization (TS-7) |
| **Provider-core coordination** | This is THE integration point. Provider-core must implement the channel spec as defined by patient-core. Encrypted transport, bilateral audit entries, consent-gated outbound, trust-validated inbound. Transport mechanism (webhook, MQ, shared encrypted log) is deferred to implementation research. |
| **Implementation notes** | Define message format, signing requirements, consent verification protocol, bilateral audit entry format. Channel is encrypted, auditable, consent-gated, minimal. Key management is patient-controlled. No persistent connections beyond what the interaction requires. |

### D-2: Configurable Autonomy Tiers Per Action

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Patients configure how much latitude their agent has per action type: Share (supervised/manual), Request (autonomous/supervised/manual), Review (autonomous/supervised), Consent (always manual). Research from CHI 2024 confirms patients' preferences for AI autonomy vary per person and context and may change over time. This system respects that variation structurally. |
| **Complexity** | Medium |
| **Dependencies** | CANS.md autonomy section, all four skills |
| **Provider-core coordination** | None -- autonomy is a patient-side configuration that determines how the patient agent behaves before data reaches the channel. |
| **Implementation notes** | Each skill checks its autonomy tier from CANS.md before executing. "autonomous" = agent acts and logs. "supervised" = agent prepares, patient reviews, then acts. "manual" = patient must initiate and approve. Consent is hardcoded to "manual" regardless of configuration. |

### D-3: Advocacy & Escalation Engine

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | The agent actively watches for boundary violations and escalates. This transforms the agent from passive gatekeeper to active advocate. Configurable escalation triggers (requests outside consent scope, actions without sufficient explanation, billing disputes) and escalation actions (block_and_notify vs warn_and_proceed). No current patient portal or health app does this -- they relay information but do not advocate. |
| **Complexity** | Medium-High |
| **Dependencies** | CANS.md advocacy section, consent gate (TS-1), review skill (TS-9), audit trail (TS-4) |
| **Provider-core coordination** | Escalation triggers may fire in response to provider-core actions. The provider agent will receive an escalation notification through the channel when the patient agent blocks an action. Provider-core should handle these gracefully. |
| **Implementation notes** | Evaluate inbound provider actions against escalation triggers. Fire configured escalation action. Log escalation events. Enable patient_rights_awareness mode where agent proactively informs patient of their rights when relevant (e.g., right to access records, right to accounting of disclosures). |

### D-4: Health Literacy-Adaptive Communication

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | The agent adjusts its language complexity based on the patient's configured health_literacy level (standard/detailed/simplified). Research shows oversimplification is as dangerous as clinical jargon -- both lead to misinformed patients. FDA 2025 guidance now requires patient-facing AI devices to provide plain-language descriptions at accessible levels. |
| **Complexity** | Low-Medium |
| **Dependencies** | CANS.md communication preferences, review skill (TS-9) |
| **Provider-core coordination** | None -- applied to how the patient agent presents information to the patient, not to channel communication. |
| **Implementation notes** | Three tiers: "simplified" (5th grade reading level, minimal medical terms), "standard" (8th-10th grade, common medical terms explained), "detailed" (clinical terminology preserved with definitions). Applied to review-skill summaries, consent-skill explanations, and onboarding language. |

### D-5: Patient-Rights Awareness

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | When enabled, the agent proactively informs the patient of their rights in relevant contexts. Example: when a provider requests records, the agent can note the patient's right under 21st Century Cures Act to access their own records. When consent is requested, the agent notes the patient's right to refuse. This turns the agent from a mechanical gatekeeper into an informed advocate. |
| **Complexity** | Low |
| **Dependencies** | CANS.md advocacy section (patient_rights_awareness flag), review skill (TS-9), consent skill (TS-10) |
| **Provider-core coordination** | None -- this is patient-facing context added to summaries. |
| **Implementation notes** | Maintain a reference set of patient rights (HIPAA, 21st Century Cures Act, state-specific). Surface relevant rights contextually when reviewing provider proposals or processing consent requests. Enable/disable via CANS.md. |

### D-6: Notification Preferences (Summary/Immediate/Batched)

| Aspect | Detail |
|--------|--------|
| **Value Proposition** | Patients choose how they want to be notified about provider communications and agent actions: immediately, in a daily summary, or batched at intervals. This reduces notification fatigue -- a major driver of patient disengagement with health portals. |
| **Complexity** | Low-Medium |
| **Dependencies** | CANS.md communication preferences, secure channel (D-1) |
| **Provider-core coordination** | None -- notification is a patient-side UX decision about when to surface information that has already been received and processed. |
| **Implementation notes** | Three modes: "immediate" (notify on every inbound event), "summary" (aggregate and present at configured intervals), "batched" (group by provider or topic). Default to "summary" for most patients. |

---

## Anti-Features

Features to explicitly NOT build. Each exclusion is deliberate and carries the force of a design decision.

### AF-1: Medical Advice or Diagnosis

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | The patient agent is not a clinician. Interpreting symptoms, suggesting diagnoses, or recommending treatments creates liability and violates data sovereignty (the patient makes health decisions, not the agent). FDA regulation of health AI tools would apply. California SB 243 / AB 489 now requires guardrails specifically preventing AI from claiming medical authority. |
| **What to Do Instead** | The agent shares, requests, reviews, and manages consent. It never interprets, diagnoses, or recommends. If the patient asks for medical advice, the agent directs them to their provider. Implement a clear guardrail that detects and deflects medical advice requests. |

### AF-2: Direct EHR/Portal Access

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | No patient portal integration, no MyChart scraping, no direct EHR reads. This requires institutional IT approval, vendor APIs, and creates data liability. It also violates the architectural boundary: the patient agent communicates with the provider's agent, not with clinical systems. |
| **What to Do Instead** | The agent communicates with the provider's CareAgent through the secure channel. The provider's agent interfaces with clinical systems on the provider side. Clean separation of concerns. |

### AF-3: Autonomous Health Decisions

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | The patient agent never makes health decisions on behalf of the patient. This includes accepting treatment plans, consenting to procedures, or declining care. AMA ethics guidance and CHI 2024 research both emphasize that AI should augment, not replace, patient decision-making. The Consent action is hardcoded to "manual" -- this is a hard constraint. |
| **What to Do Instead** | The agent presents options, summarizes in plain language, highlights conflicts with stated care goals, and facilitates the patient's own decision. It never decides for them. |

### AF-4: Bulk Data Export

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Mass export of patient health data creates exfiltration risk and undermines data minimization. A single compromised export could expose everything. This contradicts the per-interaction, per-provider, consent-gated sharing model. |
| **What to Do Instead** | Share actions are per-interaction, per-provider, and consent-gated. No bulk export mechanism exists. The audit trail records all individual disclosures, satisfying the accounting-of-disclosures requirement without bulk exposure. |

### AF-5: Multi-Patient / Caregiver Proxy Support

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Multi-patient (family/caregiver) workflows require proxy consent, legal authority verification, HIPAA personal representative rules, and potentially state-specific minor consent laws. This is a distinct regulatory and architectural problem that would double the complexity of v1. |
| **What to Do Instead** | Single patient, single agent. Caregiver/proxy support is a v2+ milestone with its own regulatory analysis (PRXY-01, PRXY-02). |

### AF-6: Insurance/Billing Optimization

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Advising on insurance claims, billing disputes, or coverage optimization creates financial advice liability. The boundary between "showing you a bill" and "advising you to dispute it" is legally treacherous. |
| **What to Do Instead** | The agent can share billing documents with providers and flag discrepancies for the patient's attention (surfacing data), but it does not advise on financial strategy. Escalation triggers can be configured for billing disputes. |

### AF-7: Hardcoded LLM Provider

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | Same as provider-core: must remain model-agnostic. Tying to a specific LLM creates vendor lock-in and limits the patient's choice of AI platform. |
| **What to Do Instead** | Support whatever OpenClaw supports. The patient layer is model-agnostic. Skills operate through the PlatformAdapter abstraction. |

### AF-8: Real Patient Data (PHI) in Development

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | HIPAA violations carry fines up to $50,000 per incident, annual maximums of $1.5 million, plus potential imprisonment. Using real PHI in dev is an unnecessary regulatory and ethical risk. |
| **What to Do Instead** | Architecture is PHI-ready (field-level encryption hooks, access control points) but all dev uses synthetic data. CANS.md includes synthetic_data_only flag. |

### AF-9: Per-Data-Category Consent Matrix (v1)

| Aspect | Detail |
|--------|--------|
| **Why Avoid** | A full per-provider x per-action x per-data-category consent matrix (e.g., "Dr. Smith can see medications but not mental health records") is the correct long-term architecture but dramatically increases v1 complexity. It requires UI for managing a combinatorial permission space and testing every permutation. |
| **What to Do Instead** | v1 uses per-provider consent (active/suspended/revoked) with data minimization applied by action type. The full matrix is deferred to v2 (CSNT-06, CSNT-07). The consent engine architecture should accommodate this extension without rewrite. |

---

## Feature Dependencies

```
CANS.md Schema (TS-2)
  |
  +-- Onboarding (TS-3) [generates CANS.md]
  |     |
  |     +-- Workspace Supplementation (TS-11)
  |
  +-- Consent Gate (TS-1) [reads consent config]
  |     |
  |     +-- Data Minimization (TS-7) [applies after consent check]
  |           |
  |           +-- Share Skill (TS-6) [uses consent + minimization + channel]
  |
  +-- Provider Verification (TS-5) [reads trust list]
  |     |
  |     +-- Secure Channel (D-1) [gated by verification]
  |           |
  |           +-- Request Skill (TS-8) [sends through channel]
  |           +-- Review Skill (TS-9) [receives through channel]
  |           +-- Consent Skill (TS-10) [bidirectional through channel]
  |           +-- Share Skill (TS-6) [sends through channel]
  |
  +-- Autonomy Tiers (D-2) [reads autonomy config]
  |     |
  |     +-- All four skills (TS-6, TS-8, TS-9, TS-10) [respect autonomy]
  |
  +-- Advocacy Engine (D-3) [reads advocacy config]
        |
        +-- Escalation Triggers [fire during review/consent]
        +-- Patient Rights Awareness (D-5)

Audit Trail (TS-4) [standalone, everything logs to it]
  |
  +-- All skills, channel, consent gate, escalation [all write to audit]

Health Literacy Adaptation (D-4) [reads communication config]
  |
  +-- Review Skill (TS-9) [applies literacy level]
  +-- Consent Skill (TS-10) [applies literacy level]
  +-- Onboarding (TS-3) [applies literacy level]

Notification Preferences (D-6) [reads communication config]
  |
  +-- Channel inbound handling [determines notification timing]
```

### Critical Path

The critical dependency chain for a functional system is:

```
CANS Schema -> Onboarding -> Audit Trail -> Consent Gate -> Provider Verification
-> Secure Channel -> Skills (Share, Request, Review, Consent)
```

Skills cannot function without the channel. The channel cannot function without provider verification. Provider verification cannot function without CANS.md. CANS.md cannot exist without onboarding. Audit trail must be in place before any action-producing component.

---

## Provider-Core Integration Points

These are the features that require coordination with `@careagent/provider-core`.

| Feature | Integration Type | Patient-Core Responsibility | Provider-Core Responsibility |
|---------|-----------------|---------------------------|------------------------------|
| **Secure Channel (D-1)** | Protocol definition | Defines and owns the channel spec (message format, signing, consent verification, audit entry format) | Implements the channel spec as defined by patient-core |
| **Share Skill (TS-6)** | Data flow (outbound) | Prepares, minimizes, consent-gates, and transmits health data | Receives and processes inbound patient data |
| **Request Skill (TS-8)** | Data flow (outbound) | Sends structured requests (appointments, referrals, records, clarification) | Receives and routes requests to appropriate clinical workflows |
| **Review Skill (TS-9)** | Data flow (inbound) | Receives, summarizes, and presents provider proposals | Sends treatment plans, orders, documentation through channel |
| **Consent Skill (TS-10)** | Data flow (bidirectional) | Receives consent requests, presents to patient, sends approval/denial | Sends consent requests, receives and processes responses |
| **Provider Verification (TS-5)** | Identity verification | Validates provider NPI and trust_level | Presents verifiable NPI credentials |
| **Audit Trail (TS-4)** | Bilateral logging | Logs patient-side events | Logs provider-side events; both log the same channel interaction independently |
| **Escalation (D-3)** | Escalation notification | Sends escalation notification when blocking a provider action | Receives and handles escalation gracefully |

---

## MVP Recommendation

### Build First (Phase 1-2: Foundation + Onboarding)

1. **CANS.md Schema + Activation Gate (TS-2)** -- Without this, nothing works
2. **Audit Trail (TS-4)** -- Must be in place before any action-producing component
3. **Onboarding Interview (TS-3)** -- Generates CANS.md; the entry point for patients
4. **Workspace Supplementation (TS-11)** -- Completes onboarding; agent becomes patient-aware
5. **Consent Gate (TS-1)** -- Core trust mechanism; must exist before any sharing capability

### Build Second (Phase 3: Channel + Consent Engine)

6. **Provider Verification (TS-5)** -- Required before channel engagement
7. **Consent Engine** (combining TS-1 consent gate + D-2 autonomy tiers) -- Full consent rules
8. **Secure Channel (D-1)** -- The integration backbone; all skills depend on it
9. **Data Minimization (TS-7)** -- Applied to outbound channel messages

### Build Third (Phase 4: Skills)

10. **Share Skill (TS-6)** -- Most sensitive; supervised by default
11. **Request Skill (TS-8)** -- Most common interaction; configurable autonomy
12. **Review Skill (TS-9)** -- Inbound processing; plain-language summaries
13. **Consent Skill (TS-10)** -- Always manual; bidirectional through channel

### Build Fourth (Phase 5: Differentiation)

14. **Advocacy Engine (D-3)** -- Active boundary enforcement and escalation
15. **Health Literacy Adaptation (D-4)** -- Refine plain-language output
16. **Patient Rights Awareness (D-5)** -- Contextual rights information
17. **Notification Preferences (D-6)** -- Notification timing and aggregation

### Defer to v2+

- Per-data-category consent matrix (AF-9 / CSNT-06, CSNT-07)
- Caregiver/proxy support (AF-5 / PRXY-01, PRXY-02)
- Cryptographic audit integrity (PROD-01: digital signatures, Merkle trees)
- HIPAA compliance implementation (PROD-02)
- Human-readable audit summary layer (PROD-03)

---

## Sources

### Regulatory and Standards
- [HIPAA Minimum Necessary Requirement](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html)
- [HIPAA Audit Log Requirements (Kiteworks)](https://www.kiteworks.com/hipaa-compliance/hipaa-audit-log-requirements/)
- [2026 HIPAA Rule Updates](https://www.chesshealthsolutions.com/2025/11/06/2026-hipaa-rule-updates-what-healthcare-providers-administrators-and-compliance-officers-need-to-know/)
- [ONC Information Blocking](https://healthit.gov/information-blocking/)
- [21st Century Cures Act / TEFCA](https://www.federalregister.gov/documents/2024/12/16/2024-29163/health-data-technology-and-interoperability-trusted-exchange-framework-and-common-agreement-tefca)
- [California AI Medical Chat Guardrails (SB 243 / AB 489)](https://healthtechmagazine.net/article/2026/01/california-adds-guardrails-ai-powered-medical-chats)
- [NPPES NPI Registry API](https://npiregistry.cms.hhs.gov/api-page)
- [FHIR Communication Resource (R4)](https://hl7.org/fhir/R4/communication.html)

### Research and Market
- [Patient Preferences for AI Autonomy (CHI 2024)](https://dl.acm.org/doi/10.1145/3613904.3642883)
- [AI Plain Language Medical Information (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12325106/)
- [Self-Sovereign Identity for Health Data (Nature Digital Medicine)](https://www.nature.com/articles/s41746-025-01945-z)
- [Consent Management Challenges (SecurePrivacy)](https://secureprivacy.ai/blog/healthcare-data-sharing-challenges-2025)
- [Patient Engagement Solutions Market](https://www.openpr.com/news/4388330/patient-engagement-solutions-market-cagr-7-12-2025-2035)
- [Healthcare AI and Patients 2026 Predictions](https://www.healthcareittoday.com/2026/01/14/healthcare-ai-and-patients-2026-health-it-predictions/)
- [Agentic AI Reshaping Healthcare 2026 (Hyro)](https://www.hyro.ai/blog/is-your-organization-agentic-ai-ready-for-2026/)
- [AI Agent Safety Guardrails (UNC)](https://healthsystemcio.com/2026/01/20/uncs-dorn-cautions-that-ai-agents-need-guardrails-to-manage-risk/)
- [Conversational AI for Healthcare (PatientNotes)](https://patientnotes.ai/resources/conversational-ai-healthcare)
