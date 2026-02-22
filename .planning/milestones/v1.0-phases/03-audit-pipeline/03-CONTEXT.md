# Phase 3: Audit Pipeline - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Hash-chained JSONL audit log for every patient action and channel interaction. Async buffered writes that never block workflow. Bilateral audit correlation IDs for patient-provider interaction linking. Background integrity verification. Patient owns the log; entries contain references and metadata, never raw health data.

</domain>

<decisions>
## Implementation Decisions

### Log entry design
- Entry metadata granularity, schema shape (unified vs separate), and human-readable summary field: Claude's discretion based on downstream phase needs (Phase 4 status command, Phase 6 channel logging, Phase 7 skill logging)
- Single append-only AUDIT.log file, no rotation for v1

### Buffering & failure
- Crash with unflushed buffer entries is acceptable — losing the last few buffered entries on crash is OK; no write-ahead log needed
- Flush trigger strategy (timer, count, or hybrid): Claude's discretion
- Write failure handling (silent degrade vs warning): Claude's discretion
- Force-flush API (`flush()` for callers needing persistence guarantees): Claude's discretion based on what consent/channel phases actually need

### Integrity verification
- Verification timing (startup, on-demand, or hybrid): Claude's discretion
- On chain break: report the break point and continue appending new entries — do NOT quarantine or restart the chain. Historical damage doesn't stop future logging
- Verification output format (structured report vs pass/fail): Claude's discretion based on Phase 4 status needs
- Genesis entry anchoring (null prev_hash vs deterministic seed): Claude's discretion

### Bilateral correlation
- Correlation ID generation (initiator vs patient-always): Claude's discretion
- Entry count per interaction (two entries vs combined): Claude's discretion based on audit trail clarity
- Bilateral entry format ownership (patient-core defines vs shared spec): Claude's discretion based on provider-core alignment
- Correlation ID format (opaque UUID vs content-derived): Claude's discretion

### Claude's Discretion
Claude has wide latitude on this phase. The user locked one firm decision (single file, no rotation; accept crash data loss) and deferred all other design decisions. Claude should optimize for:
- Clean API surface for downstream phases (Consent, Channel, Skills)
- Compatibility with provider-core's existing audit patterns
- Simplicity appropriate for v1

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User trusts Claude to design the audit pipeline based on downstream needs and provider-core alignment.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-audit-pipeline*
*Context gathered: 2026-02-21*
