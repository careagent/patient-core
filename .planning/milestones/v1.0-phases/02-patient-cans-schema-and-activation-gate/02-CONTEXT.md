# Phase 2: Patient CANS Schema and Activation Gate - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the Patient CANS.md TypeBox schema, implement SHA-256 integrity verification, and build the binary activation gate that switches the system into clinical mode. CANS.md is a pure configuration/operating-instructions file — it contains NO personal health information and NO personally identifiable information. All health data resides in the patient chart (separate concern).

</domain>

<decisions>
## Implementation Decisions

### CANS.md Schema Shape
- CANS.md is a **configuration file**, not a clinical record — it tells the agent HOW to behave
- **No health data in CANS.md** — conditions, medications, allergies, care goals all reside in the patient chart (PCANS-06 redirected to chart)
- Contents: identity_type, schema_version, consent posture defaults, communication preferences, advocacy boundaries, provider trust list
- **Core required fields:** identity_type, schema_version, consent_posture, health_literacy_level
- **Optional fields:** trust list, advocacy boundaries (default to safe values if omitted)
- Autonomy tiers are **per-action-type** — each action type (share, request, review) has its own tier: supervised, autonomous, or manual

### Validation Error Behavior
- Schema validation errors: **summary only** at startup ("CANS.md has 3 validation errors. Run 'patientagent validate' for details.")
- Detailed per-field errors available via a separate `patientagent validate` command
- Integrity (SHA-256) failure: warning + offer to re-sign ("Run 'patientagent resign' to re-validate if you made intentional changes")
- **All validation failures logged to audit trail AND console** — repeated failures could indicate tampering or an attack
- Manual edits to CANS.md are treated **same as tampering** — any modification breaks integrity, patient must use agent commands to update

### Activation Gate Semantics
- No CANS.md = **silent** standard non-clinical operation — no mention of clinical mode being available
- **Validate once at startup**, cache the activation context for the session (no mid-session re-validation)
- Activation produces a rich context object (consent posture, trust list, preferences) — not just a boolean flag (Claude's discretion)
- Non-patient identity_type: return specific rejection, no provider parsing (Claude's discretion on exact messaging)

### Provider Trust List Design
- Fields per provider: **NPI, role, trust_level, provider_name, organization, last_changed timestamp**
- Display name and organization included for human-readability without external lookups
- Four trust levels: **pending, active, suspended, revoked** — pending = handshake initiated but patient hasn't confirmed
- last_changed timestamp on each entry for stale trust state detection
- **Empty trust list is valid** — patient can activate clinical mode with zero providers and add them later

### Claude's Discretion
- Exact activation context object shape (rich object vs simple flag — leaning toward parsed ActivationContext)
- Provider CANS.md rejection messaging
- SHA-256 hash storage format and location (inline in CANS.md vs sidecar file)
- TypeBox schema structure (flat vs nested for consent posture sub-fields)

</decisions>

<specifics>
## Specific Ideas

- CANS.md is analogous to an `.env` or ACL file — operating instructions, not a medical record
- The "configuration vs data" principle: CANS.md = how the agent behaves, chart = what the patient's health data is
- Trust list is essentially a firewall allow-list — it says WHO can interact, not WHAT was shared
- If someone found a CANS.md with no chart, they should learn nothing about the patient's health

</specifics>

<deferred>
## Deferred Ideas

- **PCANS-06 redirection**: Health context (conditions, medications, allergies, care goals) needs to be modeled in the patient chart, not CANS.md. This affects Phase 4 (Onboarding) which generates the chart alongside CANS.md.
- The `patientagent validate` detailed validation command is a Phase 4 (Onboarding/CLI) concern — Phase 2 provides the validation logic, Phase 4 wires the CLI command.
- The `patientagent resign` re-signing command is similarly a Phase 4 CLI concern — Phase 2 provides the integrity-check-and-resign logic.

</deferred>

---

*Phase: 02-patient-cans-schema-and-activation-gate*
*Context gathered: 2026-02-21*
