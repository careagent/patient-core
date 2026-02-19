# Architecture Patterns

**Domain:** Patient-facing clinical AI agent plugin (OpenClaw)
**Researched:** 2026-02-18

---

## Recommended Architecture

patient-core is a layered plugin architecture mirroring provider-core's proven structure, extended with patient-specific subsystems: a **consent engine**, a **secure communication channel**, and a **defense stack** oriented around data sovereignty rather than clinical safety.

The architecture follows a strict principle: **patient-core and provider-core share zero code**. Architectural concepts (audit pipeline, CANS schema, platform adapter, activation gate) are independently implemented in both repositories. The two agents interact exclusively through a channel protocol defined and owned by patient-core.

### System Diagram

```
+------------------------------------------------------------------+
|                        PATIENT WORKSPACE                         |
|                                                                  |
|  +------------------+    +------------------+                    |
|  | Patient CANS.md  |    | Workspace Files  |                   |
|  | (YAML frontmatter)|    | SOUL/AGENTS/USER |                   |
|  +--------+---------+    +--------+---------+                    |
|           |                       |                              |
|  +--------v-----------------------v---------+                    |
|  |            Activation Gate               |                    |
|  |  (parse -> validate -> integrity -> gate)|                    |
|  +--------------------+--------------------+                     |
|                       |                                          |
|          +------------v-----------+                              |
|          |    Defense Stack       |                               |
|          | +-------------------+  |                               |
|          | | Consent Gate (L1) |  |                               |
|          | +-------------------+  |                               |
|          | | Data Minimizer(L2)|  |                               |
|          | +-------------------+  |                               |
|          | | Provider Verify(L3)| |                               |
|          | +-------------------+  |                               |
|          | | Audit Trail (L4)  |  |                               |
|          | +-------------------+  |                               |
|          +------------+-----------+                              |
|                       |                                          |
|  +--------------------v--------------------+                     |
|  |              Skill Layer                |                     |
|  |  +-------+ +--------+ +------+ +------+|                     |
|  |  | Share | |Request | |Review| |Consent||                     |
|  |  +---+---+ +---+----+ +--+---+ +--+---+|                     |
|  +------|---------|---------|---------|-----+                     |
|         |         |         |         |                          |
|  +------v---------v---------v---------v----+                     |
|  |          Channel Manager                |                     |
|  |  (envelope, encrypt, sign, route)       |                     |
|  +-------------------+--------------------+                      |
|                      |                                           |
|  +-------------------v--------------------+                      |
|  |         Audit Pipeline                 |                      |
|  |  (hash-chained JSONL, append-only)     |                      |
|  +----------------------------------------+                      |
+------------------------------------------------------------------+
                       |
            Channel Transport
          (message exchange protocol)
                       |
+------------------------------------------------------------------+
|                       PROVIDER WORKSPACE                         |
|                                                                  |
|  +----------------------------------------+                      |
|  |    Provider-core (independent impl)    |                      |
|  |  - Own audit pipeline                  |                      |
|  |  - Own activation gate                 |                      |
|  |  - Own hardening stack                 |                      |
|  |  - Channel adapter (conforms to spec)  |                      |
|  +----------------------------------------+                      |
+------------------------------------------------------------------+
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Owns |
|-----------|---------------|-------------------|------|
| **Activation Gate** | Parse Patient CANS.md, validate schema, check SHA-256 integrity, binary activate/deactivate | Audit Pipeline, Entry Points | CANS.md lifecycle |
| **Consent Engine** | Evaluate consent rules, enforce deny-by-default, per-provider trust management | Share Skill, Channel Manager, Audit Pipeline | Consent decisions |
| **Channel Manager** | Envelope formatting, encryption, signing, routing, transport abstraction | Skills (all), Audit Pipeline, Provider-core (external) | Channel protocol spec |
| **Defense Stack** | Orchestrate defense layers in order, track status, report degradation | Consent Engine, Data Minimizer, Provider Verifier, Audit Pipeline | Layer lifecycle |
| **Skill Layer** | Implement atomic actions (share, request, review, consent) with autonomy tier enforcement | Channel Manager, Consent Engine, Audit Pipeline, CANS.md | Action execution |
| **Audit Pipeline** | Hash-chained JSONL logging, session/trace management, chain verification | Every component (receives log entries) | AUDIT.log |
| **Onboarding Engine** | Conversational interview, CANS.md generation, workspace supplementation | CLI, Audit Pipeline, Workspace Writer | Interview state machine |
| **Platform Adapter** | Translate between patient-core and host platform (OpenClaw, standalone) | Entry Points, CLI, Background Services | Platform abstraction |

### Component Isolation Rules

1. **No component imports from `channel/` except skills and the defense stack.** The channel is accessed through a `ChannelManager` facade.
2. **The consent engine has no knowledge of transport.** It evaluates rules and returns allow/deny decisions. The channel manager calls it, not the other way around.
3. **Skills never bypass the defense stack.** All outbound data flows through consent gate and data minimizer before reaching the channel.
4. **The audit pipeline is write-only from every component's perspective.** No component reads audit entries at runtime (except the integrity verification background service).

---

## Data Flow

### Outbound: Patient shares health information with provider

```
1. Share Skill receives request (from LLM conversation or autonomous trigger)
2. Skill checks autonomy tier in CANS.md
   - "manual": block, require explicit patient approval
   - "supervised": prepare payload, present to patient for approval
   - "autonomous": proceed (never applies to Share in default config)
3. Skill extracts relevant health data from CANS.md health_context
4. Data Minimizer strips to minimum necessary fields for the interaction type
5. Consent Gate evaluates:
   a. Is target provider in trust list?
   b. Is trust_level "active"?
   c. Is this data category permitted for this provider? (v2: per-category)
   d. Has patient approved this specific disclosure?
6. If denied: audit log entry (blocked_reason, blocking_layer), notify patient
7. If allowed: Channel Manager creates envelope
   a. Format as ChannelMessage (see Channel Architecture below)
   b. Sign with patient's channel key
   c. Encrypt payload for target provider
   d. Add bilateral audit metadata
8. Transport layer delivers message
9. Audit Pipeline logs: share_approved, share_sent
```

### Inbound: Provider sends information to patient

```
1. Channel Manager receives inbound message
2. Provider Verifier checks:
   a. Is sender NPI in patient's trust list?
   b. Is trust_level "active"?
   c. Does message signature verify against known provider key?
3. If verification fails: audit log (provider_verification_failed), drop message
4. If verified: decrypt payload, validate against ChannelMessage schema
5. Audit Pipeline logs: channel_message_received
6. Route to appropriate skill:
   - Treatment plan proposal -> Review Skill
   - Consent request -> Consent Skill
   - Response to patient request -> Request Skill (response handler)
7. Skill processes and presents to patient in plain language
8. If consent required: Consent Skill always requires manual patient decision
```

### Bilateral Audit Flow

Every channel interaction generates audit entries on BOTH sides:

```
Patient side:                          Provider side:
+----------------------------+         +----------------------------+
| share_prepared             |         |                            |
| share_approved             |         |                            |
| channel_message_sent  ----+---------->  channel_message_received |
|                            |         |  review_proposed_action    |
|                            |         |  channel_message_sent ----+--+
| channel_message_received <-+---------+                            | |
| review_received            |         +----------------------------+ |
| review_summarized          |                                       |
+----------------------------+                                       |
```

Each side maintains an independent, hash-chained audit log. The channel message envelope includes a `bilateral_audit_ref` field containing the sender's audit entry hash for the send event, enabling cross-log correlation without shared storage.

---

## Secure Channel Architecture

The channel is the most architecturally significant open question. The PRD defines the interface contract but defers transport mechanism selection. Based on research, here is the recommended approach.

### Recommended: File-Based Encrypted Mailbox Protocol

**Confidence: MEDIUM** -- This is a novel architecture tailored to the constraints. No off-the-shelf solution matches all requirements.

Use a file-based encrypted message exchange protocol where each agent has a "mailbox" directory. Messages are encrypted, signed, and written as individual files. The receiving agent polls or watches for new files.

**Why this over alternatives:**

| Criterion | File Mailbox | Webhook/HTTP | Message Queue | A2A Protocol |
|-----------|-------------|-------------|---------------|-------------|
| Zero runtime deps | Yes | Needs HTTP server | Needs MQ broker | Needs HTTP server |
| Offline-first | Yes (files persist) | No (needs live server) | Partial (broker must be up) | No (needs live server) |
| Patient-controlled | Yes (patient owns directory) | Partial (URL exposure) | No (third-party broker) | Partial (server model) |
| Auditable | Yes (files are evidence) | Log-based only | Log-based only | Log-based only |
| Dev simplicity | High (filesystem ops) | Medium (HTTP plumbing) | Low (broker setup) | Medium (protocol impl) |
| CLI-only compatible | Yes | Awkward | No | Awkward |
| Production scalable | Needs sync layer | Yes | Yes | Yes |

**Why not A2A Protocol directly:** A2A (the Google-originated Agent2Agent protocol, now under Linux Foundation governance) is the emerging standard for agent-to-agent communication. It uses JSON-RPC 2.0 over HTTP(S) with Agent Cards for discovery, OAuth 2.0/mTLS for auth, and supports sync/streaming/async modes. However, it assumes network-available HTTP servers on both sides, which conflicts with patient-core's CLI-only, zero-dependency, offline-first design. A2A is the right long-term target for production deployments, but v1 needs something simpler.

**Recommendation:** Design the `ChannelManager` with a `Transport` interface that abstracts the mechanism. Implement `FileTransport` for v1. Design `ChannelMessage` envelope to be A2A-compatible so a future `A2ATransport` can wrap it without changing the skill layer.

### ChannelMessage Envelope (Confidence: HIGH)

The message envelope is transport-agnostic. This is what patient-core defines and owns.

```typescript
/** Unique identifier for a channel message. */
type MessageId = string; // UUIDv4

/** Channel message envelope -- the wire format between agents. */
interface ChannelMessage {
  /** Protocol version for forward compatibility. */
  protocol_version: '1.0';

  /** Unique message identifier. */
  message_id: MessageId;

  /** Reference to the message this replies to, if any. */
  in_reply_to?: MessageId;

  /** Conversation thread identifier for grouping related messages. */
  thread_id: string;

  /** ISO 8601 timestamp of message creation. */
  timestamp: string;

  /** Sender identity. */
  sender: {
    identity_type: 'patient' | 'provider';
    /** Patient: synthetic MRN. Provider: NPI. */
    identifier: string;
    /** Display name for audit/UI. */
    name: string;
  };

  /** Recipient identity (same structure as sender). */
  recipient: {
    identity_type: 'patient' | 'provider';
    identifier: string;
    name: string;
  };

  /** The action that generated this message. */
  action: 'share' | 'request' | 'review' | 'consent' | 'acknowledge';

  /** Message payload -- encrypted in transit, plaintext here is the decrypted form. */
  payload: {
    /** MIME type of the content. */
    content_type: 'application/json';
    /** The actual content, structured per action type. */
    body: SharePayload | RequestPayload | ReviewPayload | ConsentPayload | AcknowledgePayload;
  };

  /** Data minimization declaration: what categories are included. */
  data_categories: string[];

  /** Consent reference: which consent authorization permits this message. */
  consent_ref?: {
    /** Audit trace ID of the consent decision. */
    trace_id: string;
    /** Timestamp of consent. */
    consented_at: string;
  };

  /** Bilateral audit correlation. */
  audit_ref: {
    /** SHA-256 hash of the sender's audit entry for this send event. */
    sender_audit_hash: string;
    /** Sender's session ID for cross-log correlation. */
    sender_session_id: string;
  };

  /** Digital signature over the canonical JSON of the message (excluding this field). */
  signature: string;
}
```

### Transport Interface

```typescript
/** Abstract transport layer -- implementations handle the "how" of delivery. */
interface ChannelTransport {
  /** Send a message to a recipient. Returns delivery confirmation. */
  send(message: EncryptedEnvelope): Promise<DeliveryResult>;

  /** Poll for new inbound messages. Returns unread messages. */
  receive(): Promise<EncryptedEnvelope[]>;

  /** Register a handler for real-time inbound messages (optional). */
  onMessage?(handler: (message: EncryptedEnvelope) => void): void;

  /** Check if transport is available/healthy. */
  healthCheck(): Promise<boolean>;
}

/** v1: File-based transport. */
interface FileTransportConfig {
  /** Directory for outbound messages (patient writes, provider reads). */
  outboxPath: string;
  /** Directory for inbound messages (provider writes, patient reads). */
  inboxPath: string;
  /** Polling interval in milliseconds. */
  pollIntervalMs: number;
}

/** Encrypted wire format. */
interface EncryptedEnvelope {
  /** The encrypted ChannelMessage payload. */
  ciphertext: string;
  /** Encryption algorithm identifier. */
  algorithm: 'aes-256-gcm';
  /** Initialization vector. */
  iv: string;
  /** Authentication tag. */
  auth_tag: string;
  /** Key identifier (references a shared key). */
  key_id: string;
  /** Sender's public signature for verification. */
  sender_signature: string;
}
```

### Key Management (v1: Simplified)

For v1 with synthetic data, use a pre-shared key model:

1. During provider trust establishment, patient and provider exchange a shared secret (out-of-band).
2. Shared secret derives an AES-256-GCM key via HKDF.
3. Each message uses a unique IV (random 12 bytes).
4. Signing uses Ed25519 keypairs generated during onboarding.

**v2 upgrade path:** Asymmetric encryption (X25519 key exchange), per-session ephemeral keys, and key rotation. This is a well-understood progression that does not require architectural changes -- only a new `KeyManager` implementation.

### Channel Architecture Decision Rationale

The file-based approach is chosen for v1 because:

1. **Zero runtime dependencies.** Node.js `fs` and `crypto` built-ins are sufficient.
2. **Patient controls the mailbox.** The inbox/outbox directories live in the patient's workspace. The patient can inspect, audit, or delete any message file.
3. **CLI-compatible.** No HTTP server or background process required for basic operation (polling can be a background service via `registerBackgroundService`).
4. **Offline-resilient.** Messages persist as files. If the recipient is offline, messages queue naturally.
5. **Auditable by design.** Message files are evidence artifacts that can be referenced from the audit log.
6. **A2A-forward-compatible.** The `ChannelMessage` envelope is designed to map cleanly onto A2A's `Message`/`Task` model. A future `A2ATransport` wraps the same envelope in JSON-RPC 2.0 over HTTP(S).

**What this does NOT solve (explicitly deferred):**

- Network transport between machines (v1 assumes shared filesystem or manual file exchange for demos)
- Real-time delivery (v1 uses polling)
- Automatic provider discovery (v1 uses manual trust list configuration)

---

## Consent Engine Design

The consent engine is the core of the patient autonomy model. It is a rule evaluation system that answers one question: **"Is this outbound action permitted by the patient's current consent configuration?"**

### Architecture

```
+---------------------------------------------------+
|                  Consent Engine                    |
|                                                   |
|  +-----------+   +-----------+   +-------------+  |
|  | Rule Set  |   | Evaluator |   | Decision Log|  |
|  | (from     |   | (deny-by- |   | (audit      |  |
|  |  CANS.md) |   |  default) |   |  entries)   |  |
|  +-----+-----+   +-----+-----+   +------+------+  |
|        |               |                |          |
|  +-----v---------------v----------------v------+   |
|  |           ConsentGate.evaluate()            |   |
|  |  Input: action, target_provider, data_cats  |   |
|  |  Output: { allowed: bool, reason: string }  |   |
|  +---------------------------------------------+   |
+---------------------------------------------------+
```

### ConsentGate Interface

```typescript
interface ConsentRequest {
  /** The action being attempted. */
  action: 'share' | 'request' | 'review' | 'consent';
  /** Target provider identifier (NPI). */
  target_provider_npi: string;
  /** Data categories being accessed/shared. */
  data_categories: string[];
  /** Autonomy tier from CANS.md for this action. */
  autonomy_tier: 'autonomous' | 'supervised' | 'manual';
}

interface ConsentDecision {
  allowed: boolean;
  reason: string;
  /** Which rule triggered the decision. */
  rule: string;
  /** If denied, which defense layer blocked it. */
  blocking_layer?: 'consent_gate' | 'provider_trust' | 'data_minimization';
}

interface ConsentGate {
  /** Evaluate whether an action is permitted. */
  evaluate(request: ConsentRequest): ConsentDecision;
  /** Check if a provider is trusted and active. */
  isProviderTrusted(npi: string): boolean;
  /** Get trust level for a provider. */
  getProviderTrustLevel(npi: string): 'active' | 'suspended' | 'revoked' | null;
}
```

### Rule Evaluation Order (Deny-by-Default)

The consent engine evaluates rules in strict order. The first matching deny rule terminates evaluation.

```
1. DENY if no CANS.md loaded (inactive state)
2. DENY if target_provider_npi not in providers list
3. DENY if provider trust_level !== 'active'
4. DENY if action === 'consent' && autonomy_tier !== 'manual'
   (hardcoded safety: consent is always manual)
5. DENY if action === 'share' && consent.default_sharing === 'deny'
   && no explicit per-provider override allows it
6. ALLOW if all checks pass
```

v2 adds per-data-category rules (CSNT-06, CSNT-07) as step 5.5 in the evaluation chain, but the architecture accommodates this now by accepting `data_categories` in the request.

### Design Informed by FHIR Consent Resource

The consent engine's structure draws from the [FHIR Consent resource](https://build.fhir.org/consent.html) (Confidence: HIGH, official HL7 spec):

- **Base policy + exceptions model.** FHIR Consent uses a `decision` field (deny/permit) as the baseline, with `provision` entries as exceptions. Patient-core mirrors this: `default_sharing: "deny"` is the base policy, and the provider trust list with per-provider overrides acts as the exceptions.
- **Temporal validity.** FHIR Consent has `period` fields. Patient-core can add consent expiration in v2 without architectural changes.
- **Actor-scoped rules.** FHIR provisions scope to actors by role and reference. Patient-core scopes to providers by NPI and trust_level.
- **Data category tagging.** FHIR uses `securityLabel` and `resourceType` for data categorization. Patient-core's `data_categories` field maps to this concept for v2 granular consent.

This alignment means patient-core's consent model can generate FHIR Consent resources in future versions for interoperability with clinical systems that consume FHIR.

---

## Defense Stack Design

patient-core's defense stack serves a different purpose than provider-core's hardening stack. Provider-core prevents the agent from acting outside clinical scope. Patient-core prevents unauthorized data exposure and unconsented actions.

### Layer Architecture

Modeled after provider-core's `HardeningStack` pattern (Confidence: HIGH, direct code analysis):

```typescript
/** Patient defense layer interface (mirrors provider-core's HardeningLayer). */
interface DefenseLayer {
  readonly name: DefenseLayerName;
  activate(ctx: DefenseContext): LayerStatus;
  getStatus(): LayerStatusReport;
}

type DefenseLayerName =
  | 'consent_gate'
  | 'data_minimization'
  | 'provider_verification'
  | 'audit_trail';

interface DefenseContext {
  cans: PatientCANSDocument;
  adapter: PlatformAdapter;
  audit: AuditPipeline;
  workspacePath: string;
}
```

### Four Defense Layers

| Layer | Purpose | Blocks When | Provider-core Analog |
|-------|---------|-------------|---------------------|
| **Consent Gate** | Enforce consent rules on all outbound data | Provider not trusted, consent not granted, default deny | Safety Guard |
| **Data Minimizer** | Strip outbound messages to minimum necessary | Payload contains fields not relevant to interaction type | (no direct analog) |
| **Provider Verifier** | Validate provider identity on inbound messages | NPI not in trust list, trust_level not active, signature invalid | Tool Policy |
| **Audit Trail** | Log every action with full context | Never blocks (always active) | Audit Integration |

### Activation Sequence

Mirrors provider-core's `createHardeningStack` factory pattern:

```typescript
function createDefenseStack(ctx: DefenseContext): DefenseStack {
  const stack = new DefenseStack(ctx);

  if (ctx.cans.hardening.consent_gate) {
    stack.addLayer(new ConsentGateLayer());
  }
  if (ctx.cans.hardening.data_minimization) {
    stack.addLayer(new DataMinimizationLayer());
  }
  if (ctx.cans.hardening.provider_verification) {
    stack.addLayer(new ProviderVerificationLayer());
  }
  if (ctx.cans.hardening.audit_trail) {
    stack.addLayer(new AuditTrailLayer());
  }

  return stack;
}
```

---

## Patient CANS Schema Architecture

The Patient CANS.md follows the same pattern as provider-core (YAML frontmatter parsed by bundled YAML, validated by TypeBox, integrity-checked via SHA-256) but with patient-specific semantics.

### Schema Differences from Provider CANS

| Section | Provider-core | Patient-core | Rationale |
|---------|--------------|-------------|-----------|
| Identity | `provider` (name, NPI, license, specialty) | `patient` (name, DOB, MRN, preferred_name) | Different identity model |
| Scope | `scope` (permitted/prohibited actions) | `health_context` (conditions, meds, allergies, goals) | Patient has health data, not practice scope |
| Autonomy | `autonomy` (chart, order, charge, perform) | `autonomy` (share, request, review, consent) | Different atomic actions |
| Hardening | `hardening` (6 boolean flags for 6 layers) | `hardening` (4 boolean flags for 4 defense layers) | Different threat model |
| Consent | `consent` (HIPAA ack, synthetic, audit) | `consent` (synthetic, audit, default_sharing) | Patient controls data sharing |
| **New sections** | -- | `providers` (trust list), `communication`, `advocacy` | Patient-specific concerns |

### TypeBox Schema (Recommended Structure)

```typescript
const PatientCANSSchema = Type.Object({
  version: Type.String(),
  identity_type: Type.Literal('patient'),
  patient: PatientIdentitySchema,
  health_context: HealthContextSchema,
  consent: PatientConsentSchema,
  providers: Type.Array(TrustedProviderSchema),
  communication: CommunicationPrefsSchema,
  advocacy: AdvocacySchema,
  autonomy: PatientAutonomySchema,
  hardening: PatientHardeningSchema,
});
```

The `identity_type: 'patient'` field is the discriminator. If provider-core ever encounters a CANS.md with `identity_type: 'patient'`, it ignores it (and vice versa). This enables both plugins to coexist in a workspace without conflict, though this is not a v1 use case.

---

## Integration Model: Patient-core and Provider-core

### Zero-Dependency Integration

The two packages integrate through a **shared protocol, not shared code**.

```
patient-core                    provider-core
    |                               |
    |  ChannelMessage envelope      |
    |  (patient-core owns spec)     |
    |                               |
    |  EncryptedEnvelope            |
    |  (patient-core owns spec)     |
    |                               |
    |  ChannelTransport interface   |
    |  (patient-core owns spec)     |
    |                               |
    +--- publishes spec as -------->|
    |    documentation/JSON Schema  |
    |                               |
    |  Provider implements          |
    |  ChannelAdapter that          |
    |  conforms to patient spec     |
    |                               |
```

### What patient-core publishes (spec artifacts):

1. **ChannelMessage JSON Schema** -- TypeBox schema exported as JSON Schema for provider-core to validate against.
2. **EncryptedEnvelope format** -- Encryption algorithm, IV format, key derivation parameters.
3. **Transport protocol** -- For FileTransport: directory structure, file naming, polling semantics. For future A2ATransport: JSON-RPC method names, Agent Card schema.
4. **Bilateral audit entry format** -- How `audit_ref` fields should be populated for cross-log correlation.

### What provider-core implements:

1. **ChannelAdapter** -- A new module in provider-core that reads patient-core's published spec and implements the provider side of the channel.
2. **Message validation** -- Validates inbound ChannelMessages against the published JSON Schema.
3. **Bilateral audit** -- Populates `audit_ref` in outbound messages per patient-core's spec.

### Integration Timeline

```
Phase 1-2 (patient-core): Build foundation + consent engine
  - Provider-core: No changes needed

Phase 3 (patient-core): Channel implementation
  - Provider-core: Review published channel spec
  - Provider-core: Begin ChannelAdapter implementation

Phase 4 (patient-core): Skills implementation
  - Provider-core: ChannelAdapter complete
  - Both: Can test independently against fixtures

Phase 5 (both): Integration testing
  - Both: End-to-end message exchange with synthetic data
  - Both: Bilateral audit verification
```

---

## Patterns to Follow

### Pattern 1: Activation Gate with Type Discriminator

**What:** Binary activation gate that checks CANS.md presence, parses YAML frontmatter, validates against TypeBox schema, and verifies SHA-256 integrity. Uses `identity_type` field as discriminator.

**When:** Every plugin load, every CANS.md change.

**Why:** Proven pattern from provider-core. Prevents partial activation states. The discriminator field (`identity_type: 'patient'` vs implicit provider) ensures the right plugin activates for the right CANS.md.

```typescript
// Patient activation gate -- structurally identical to provider-core's
export class ActivationGate {
  check(): ActivationResult {
    // 1. Presence: does CANS.md exist?
    // 2. Parse: extract YAML frontmatter
    // 3. Discriminator: is identity_type === 'patient'?
    // 4. Validate: TypeBox schema check
    // 5. Integrity: SHA-256 verification
    // Any failure -> { active: false, document: null, reason: '...' }
  }
}
```

### Pattern 2: Defense Stack as Ordered Layer Pipeline

**What:** Defense layers registered in order, activated sequentially, status tracked collectively. Mirrors provider-core's `HardeningStack`.

**When:** After activation gate passes, before any skill execution.

**Why:** Provider-core proved this pattern works. Ordered evaluation means layers can build on each other. Status tracking enables the `careagent status` command to report defense posture.

### Pattern 3: Skills as Autonomous Units with Consent Checks

**What:** Each skill is a self-contained module that: (a) checks autonomy tier, (b) prepares payload, (c) calls consent gate, (d) calls channel manager. Skills never skip steps.

**When:** Any atomic action (share, request, review, consent).

**Why:** Uniform structure makes skills testable in isolation. The consent check is built into the skill flow, not bolted on externally.

```typescript
abstract class BaseSkill {
  constructor(
    protected consent: ConsentGate,
    protected channel: ChannelManager,
    protected audit: AuditPipeline,
    protected cans: PatientCANSDocument,
  ) {}

  /** Template method: subclasses override specific steps. */
  async execute(params: SkillParams): Promise<SkillResult> {
    // 1. Check autonomy tier
    const tier = this.getAutonomyTier();
    if (tier === 'manual') {
      return { status: 'awaiting_approval', ... };
    }
    // 2. Prepare payload (subclass)
    const payload = await this.preparePayload(params);
    // 3. Consent check
    const decision = this.consent.evaluate({...});
    if (!decision.allowed) {
      this.audit.logBlocked({...});
      return { status: 'blocked', reason: decision.reason };
    }
    // 4. Send via channel (if outbound)
    // 5. Audit log
  }

  protected abstract preparePayload(params: SkillParams): Promise<unknown>;
  protected abstract getAutonomyTier(): AutonomyTierType;
}
```

### Pattern 4: Entry Point Separation (OpenClaw / Standalone / Core)

**What:** Three entry points with increasing levels of side effects, identical to provider-core's `entry/` structure.

**When:** Always. This is how the package is consumed.

**Why:** Provider-core's pattern works. Consumers import what they need without unwanted activation.

```
src/entry/openclaw.ts   -- register() function called by OpenClaw plugin system
src/entry/standalone.ts -- activate() function for non-OpenClaw environments
src/entry/core.ts       -- pure type/class re-exports, no side effects
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared Code Between patient-core and provider-core

**What:** Extracting common code (audit writer, CANS parser, YAML vendor, etc.) into a shared package.

**Why bad:** Creates a coupling point. A breaking change in the shared package breaks both agents simultaneously. Version skew becomes a coordination problem. The packages must be deployable and testable independently.

**Instead:** Independently implement shared concepts. The code is small (audit writer is ~120 lines, CANS parser is ~50 lines). Duplication is the correct tradeoff for decoupling in a clinical context.

### Anti-Pattern 2: Channel Manager as a Singleton

**What:** Creating a global ChannelManager instance that skills import directly.

**Why bad:** Makes testing difficult. Creates hidden state. Prevents multiple channel configurations (e.g., different transport per provider in future).

**Instead:** Inject ChannelManager into skills via constructor. The entry point creates the instance and wires it to skills.

### Anti-Pattern 3: Consent Rules in Skill Code

**What:** Embedding consent logic (trust checks, sharing rules) directly in skill implementations.

**Why bad:** Consent rules change. Skills should not need to change when consent rules change. Consent logic scattered across skills is untestable as a unit.

**Instead:** All consent logic lives in the ConsentEngine. Skills call `consentGate.evaluate()` and act on the boolean result. They never inspect consent rules directly.

### Anti-Pattern 4: Synchronous Audit Writes in the Hot Path

**What:** Using synchronous `appendFileSync` for audit writes during skill execution (note: provider-core currently does this).

**Why bad for patient-core:** Patient-core has more audit events per action (consent check, data minimization, provider verification, channel events). Synchronous writes compound. The PRD specifies "async buffered writes -- audit never blocks patient workflow" (AUDT-04).

**Instead:** Buffer audit entries in memory and flush to disk asynchronously. Use `setImmediate` or a microtask to batch writes. The hash chain is maintained in memory; the flush operation writes the batch.

---

## Scalability Considerations

| Concern | Single User (v1) | 10+ Providers | Production |
|---------|------------------|---------------|------------|
| **Consent evaluation** | In-memory rule check, microseconds | Same (rules are O(n) where n = providers) | Cache compiled rules, still fast |
| **Channel messages** | File-based, polling | File-based, multiple mailbox dirs | A2ATransport over HTTP(S) |
| **Audit log size** | Single JSONL file, ~1KB/entry | Same file, grows linearly | Log rotation, archival strategy |
| **Key management** | Pre-shared keys | Per-provider key pairs | PKI, key rotation, certificate authority |
| **CANS.md size** | ~2KB YAML | Grows with provider list | Consider provider list as separate file |

---

## Suggested Build Order

Based on dependency analysis between components:

```
Phase 1: Plugin Foundation
  activation/ -> adapters/ -> audit/ -> entry/ -> types/ -> vendor/
  (No dependencies on consent, channel, or skills)
  (Mirrors provider-core Phase 1-2 structure exactly)

Phase 2: Onboarding + Consent Engine
  onboarding/ -> consent/ -> cli/
  (Depends on: activation, audit, adapters)
  (consent/ has no dependency on channel/)

Phase 3: Channel Protocol
  channel/ (types, manager, file-transport, encryption)
  (Depends on: audit, consent, types)
  (This is where patient-core publishes the spec)

Phase 4: Skills
  skills/ (share, request, review, consent)
  (Depends on: consent, channel, audit, activation)
  (All skills use the BaseSkill template pattern)

Phase 5: Integration Testing
  test/integration/
  (Depends on: everything above + provider-core's ChannelAdapter)
```

### Critical Path Dependencies

```
activation/gate.ts ------> everything (must exist first)
audit/pipeline.ts -------> everything (must exist first)
consent/gate.ts ---------> skills/* (skills call consent)
channel/manager.ts ------> skills/* (skills send via channel)
channel/types.ts --------> provider-core (provider reads spec)
```

### What Can Parallelize

- `onboarding/` and `consent/` can be built in parallel (different teams/phases)
- `channel/types.ts` (the spec) can be written before `channel/manager.ts` (the implementation)
- Individual skills can be built in parallel once `BaseSkill` exists
- Unit tests for each component can be written alongside implementation

---

## Sources

- Provider-core source code (direct analysis, `/Users/medomatic/Documents/Projects/provider-core/src/`): HIGH confidence
- Patient-core PRD (`/Users/medomatic/Documents/Projects/patient-core/patient-core-PRD.md`): HIGH confidence
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/): HIGH confidence (official spec)
- [Google A2A Announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/): HIGH confidence
- [A2A Security Analysis (Semgrep)](https://semgrep.dev/blog/2025/a-security-engineers-guide-to-the-a2a-protocol/): MEDIUM confidence
- [Linux Foundation A2A Project](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents): HIGH confidence
- [FHIR Consent Resource (HL7)](https://build.fhir.org/consent.html): HIGH confidence (official spec)
- [HL7 Scalable Consent Management IG](https://build.fhir.org/ig/HL7/fhir-consent-management/): HIGH confidence
- [A2A Security (Red Hat)](https://developers.redhat.com/articles/2025/08/19/how-enhance-agent2agent-security): MEDIUM confidence
- [IBM A2A Overview](https://www.ibm.com/think/topics/agent2agent-protocol): MEDIUM confidence
