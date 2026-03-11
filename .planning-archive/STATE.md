# STATE: @careagent/patient-core

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** The patient is the ultimate authority over their health information -- nothing leaves their workspace without explicit consent, and their agent advocates for their stated preferences at every interaction.
**Current focus:** Phase 7 (Patient Skills and Defense Integration)

## Current Position

**Milestone:** v2.0 Foundation -- Phases 4-6 built via autonomous sessions (06a-06d, 2026-02-22 to 2026-02-28)
**Status:** Phases 4-6 complete. Phase 7 next.

```
[######--] 75% (6/8 phases complete)
```

## Phase Status

| Phase | Milestone | Status | Plans |
|-------|-----------|--------|-------|
| 1. Plugin Scaffolding and Platform Portability | v1.0 | Complete | 2/2 |
| 2. Patient CANS Schema and Activation Gate | v1.0 | Complete | 3/3 |
| 3. Audit Pipeline | v1.0 | Complete | 3/3 |
| 4. Onboarding and Agent Configuration | v2.0 | Complete (Session 06a) | -- |
| 5. Consent Engine | v2.0 | Complete (Sessions 06c, 06b) | -- |
| 6. Secure Channel Protocol | v2.0 | Complete (Session 06d) | -- |
| 7. Patient Skills and Defense Integration | TBD | Not started | TBD |
| 8. Integration Testing and Documentation | TBD | Not started | TBD |

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 8 (+ 4 autonomous sessions) |
| Plans failed | 0 |
| Requirements delivered | 23/23 (v1.0), Phases 4-6 (v2.0) |
| Test coverage | 93%+ (statements) |
| Total tests | 4,958 |
| LOC | 9,536 TypeScript (6,314 v1.0 + 3,222 sessions) |

## Accumulated Context

### Research Flags

| Phase | Flag | Detail |
|-------|------|--------|
| Phase 4 | RESOLVED | 9-stage state machine implemented (Session 06a); 3 health literacy levels wired |
| Phase 5 | RESOLVED | 3 consent postures (deny-all, allow-trusted, custom) with per-provider trust (Session 06c); wired to hardening Layer 5 |
| Phase 6 | RESOLVED | Ed25519 keypair gen + AES-GCM encryption via WebSocket RFC 6455 (Sessions 06b, 06d) |
| Phase 7 | STANDARD | BaseSkill template fully specified in ARCHITECTURE.md |
| Phase 8 | STANDARD | Integration testing follows standard cross-repo contract testing |

### Critical Pitfalls to Track

| Pitfall | Severity | Relevant Phase | Status |
|---------|----------|----------------|--------|
| Consent gate bypass via LLM context leakage | CRITICAL | Phase 7 | Not addressed |
| Consent fatigue from deny-by-default | CRITICAL | Phase 5 | Mitigated (3 postures with per-provider trust, Session 06c) |
| AES-GCM IV reuse destroying encryption | CRITICAL | Phase 6 | Addressed (counter-based IVs in src/messaging/crypto.ts, Session 06d) |
| Cross-agent prompt injection via provider messages | CRITICAL | Phase 7 | Not addressed |
| Hook dependency for async consent (OpenClaw limitation) | CRITICAL | Phase 7 | Mitigated by design (skill-internal flow) |

### Tech Debt (from v1.0)

- 11 stale `// Audit pipeline may be a stub` try/catch blocks (clean before Phase 7)
- `writeIntegritySidecar` export not yet consumed by source
- CLI handler stubs throw 'not yet implemented'
- Audit integrity service only registered in active clinical mode path (design tradeoff)

### Blockers

None currently.

## Session Continuity

**Last session:** 2026-02-28 (Session 06d)
**Stopped At:** Phases 4-6 complete via 4 autonomous sessions (06a-06d)
**What happened:** Four autonomous sessions built Phases 4-6 outside GSD:
- 06a (Onboarding): Telegram bot with 9-state machine, Ed25519 keypair gen, CANS.md generation (src/bot/, 6 files, 1,282 tests)
- 06b (Discovery): Axon discovery with NPI lookup, Ed25519 signatures, ConnectRequest/Grant/Denial (src/discovery/, 5 files, 957 tests)
- 06c (Consent): 3 postures (deny-all, allow-trusted, custom), per-provider trust, health literacy levels, wired to Layer 5 (src/consent/, 4 files, 699 tests)
- 06d (Messaging): WebSocket RFC 6455 server, auth tokens, AES-GCM encryption (src/messaging/, 5 files, 1,793 tests)
**Next action:** Phase 7 (Patient Skills and Defense Integration)
**Open questions:** None blocking.

---
*Last updated: 2026-03-02 after GSD sync with autonomous sessions 06a-06d*
