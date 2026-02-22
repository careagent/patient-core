# STATE: @careagent/patient-core

## Project Reference

**Core Value:** The patient is the ultimate authority over their health information -- nothing leaves their workspace without explicit consent, and their agent advocates for their stated preferences at every interaction.

**Architecture:** Hybrid OpenClaw plugin + dedicated `patientagent`. Plugin handles system concerns (CLI, hooks, audit, tool policy). Dedicated agent provides persistent clinical workspace with CANS.md and clinical skills.

**Key Constraint:** Zero runtime npm dependencies. No provider-core dependency. Synthetic data only.

## Current Position

**Phase:** 3 - Audit Pipeline
**Plan:** 3 of 3 complete
**Status:** Milestone complete

```
[####----] 37% (3/8 phases complete)
```

## Phase Status

| Phase | Status | Plans |
|-------|--------|-------|
| 1. Plugin Scaffolding and Platform Portability | Complete | 2/2 plans complete |
| 2. Patient CANS Schema and Activation Gate | Complete | 3/3 plans complete |
| 3. Audit Pipeline | Complete | 3/3 plans complete |
| 4. Onboarding and Agent Configuration | Not started | TBD |
| 5. Consent Engine | Not started | TBD |
| 6. Secure Channel Protocol | Not started | TBD |
| 7. Patient Skills and Defense Integration | Not started | TBD |
| 8. Integration Testing and Documentation | Not started | TBD |

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 8 |
| Plans failed | 0 |
| Requirements delivered | 24/69 |
| Test coverage | 87% (lines) |
| Phase 02 P01 | 3min | 2 tasks | 3 files |
| Phase 02 P02 | 7min | 2 tasks | 10 files |
| Phase 02 P03 | 6min | 3 tasks | 8 files |
| Phase 03 P01 | 5min | 2 tasks | 4 files |
| Phase 03 P02 | 3min | 1 task | 3 files |
| Phase 03 P03 | 3min | 2 tasks | 4 files |

## Accumulated Context

### Key Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| 8-phase comprehensive roadmap | 69 requirements across 12 categories; comprehensive depth allows natural delivery boundaries | Roadmap |
| DFNS requirements distributed across phases | Defense requirements are integration concerns verified where their host subsystem lives | Roadmap |
| Phase 2 and 3 parallelizable | CANS schema and Audit pipeline have no mutual dependency; both depend only on Phase 1 | Roadmap |
| PLUG-06 assigned to Phase 4, not Phase 1 | `patientagent init` is the onboarding entry point (generates CANS.md + configures agent), not a plugin scaffold concern | Roadmap |
| Risk-stratified consent tiers in Phase 5 | Research Pitfall 2 (consent fatigue) requires design-time solution; cannot retrofit after skills are built | Roadmap |
| v1 integration uses mock provider harness | Provider-core v1 deferred COMM/PCAG to v2 — no ChannelAdapter exists; patient-core v1 tests against conformance harness, live cross-repo testing deferred to v2 | Roadmap |
| Skill instructions must wire into agent context | Provider-core Phase 7 gap: `buildChartSkillInstructions()` never called by skill loader — patient-core must avoid this pattern; verify skill instructions inject at load time | Roadmap |
| Added @types/node@22 devDependency | TypeScript does not ship Node.js type definitions; required for process, console, node:* to resolve in typecheck | Phase 1 |
| Hook registry is adapter-internal (Map-based) | Avoids coupling patient-core hook naming to OpenClaw's event system; per RESEARCH.md recommendation | Phase 1 |
| Patient audit uses patient-specific actors/states | Audit entry-schema uses 'patient' actor and patient-approved/modified/rejected action states | Phase 1 |
| Hardening layers use defensive CANS access | CANSDocument is Phase 2 placeholder; layers cast to Record and use optional chaining | Phase 1 |
| All audit.log calls wrapped in try/catch | AuditPipeline is Phase 3 stub that throws; prevents crashes before audit implementation | Phase 1 |
| Coverage excludes stub modules | Phase 2-7 stubs excluded from thresholds to measure only implemented code accurately | Phase 1 |
| consent-gate/data-minimization are allow-all stubs | Explicitly reference Phase 5 in return reasons for traceability | Phase 1 |
| Sidecar file .CANS.md.sha256 for integrity | Avoids YAML round-trip instability from inline _integrity approach | Phase 2 |
| IntegrityResult discriminated union | Distinguishes no-sidecar vs hash-mismatch for different remediation messages | Phase 2 |
| verifyIntegrity is async with sidecar path | Breaking change from sync stub; gate.check() must be async accordingly | Phase 2 |
| Exported TrustListEntrySchema and TrustLevelSchema | Enables test reuse and sub-schema validation in Plan 03 tests | Phase 2 |
| cans-injection uses typed CANSDocument field access | Replaced defensive Record casting with typed access for consent_posture, providers, autonomy | Phase 2 |
| extractProtocolRules includes consent posture, provider count, autonomy | Produces meaningful protocol output from real CANS fields | Phase 2 |
| Removed Phase 1 scope.permitted_actions placeholder | No corresponding field in real CANSDocument schema | Phase 2 |
| Integrity check BEFORE schema validation in gate pipeline | Tampered-but-schema-valid CANS.md must fail on integrity, not schema; prevents bypass | Phase 2 |
| No audit for silent no-cans case | CONTEXT.md: no mention of clinical mode when CANS.md absent; gate returns silently | Phase 2 |
| Constructor options for flush threshold/interval | Enables testability with low thresholds while keeping production defaults (10 entries, 1000ms) | Phase 3 |
| Explicit JSON field ordering in append() | Prevents non-deterministic serialization that would break hash chain (RESEARCH.md Pitfall 2) | Phase 3 |
| Flush timer unref'd | Prevents Node.js process from hanging on exit (RESEARCH.md Pitfall 3) | Phase 3 |
| Coverage exclusions removed for implemented modules | entry-schema.ts and writer.ts are no longer stubs; coverage now measured accurately | Phase 3 |
| AuditLogInput extended with correlation_id, summary, provider | Matches entry schema from Plan 01; provider actor needed for bilateral audit symmetry | Phase 3 |
| logBlocked() wraps log() with denied/system defaults | Consistent blocked-action pattern across all call sites | Phase 3 |
| Pipeline coverage exclusion removed | pipeline.ts no longer a stub; achieves 100% coverage | Phase 3 |
| Integrity service reports and continues on chain break | User decision: no quarantine, no chain restart -- report error and keep appending | Phase 3 |
| Flush before verifyChain in integrity service | Ensures buffered entries are on disk before chain validation; prevents false positives | Phase 3 |
| Integrity service coverage exclusion removed | integrity-service.ts no longer a stub; all audit modules now coverage-measured | Phase 3 |

### Research Flags

| Phase | Flag | Detail |
|-------|------|--------|
| Phase 1 | STANDARD | Provider-core Phase 1-2 is direct reference |
| Phase 2 | STANDARD | TypeBox schema patterns documented in ARCHITECTURE.md |
| Phase 3 | STANDARD | Hash-chain audit patterns documented |
| Phase 4 | NEEDS RESEARCH | 9-stage interview prompts at 3 health literacy levels; risk stratification tier thresholds |
| Phase 5 | NEEDS RESEARCH | Risk-stratified consent tier definitions have regulatory implications (42 CFR Part 2, state mental health laws) |
| Phase 6 | NEEDS RESEARCH | Key exchange ceremony for v1 file-based transport; out-of-band key distribution UX |
| Phase 7 | STANDARD | BaseSkill template fully specified in ARCHITECTURE.md |
| Phase 8 | STANDARD | Integration testing follows standard cross-repo contract testing |

### Critical Pitfalls to Track

| Pitfall | Severity | Relevant Phase | Status |
|---------|----------|----------------|--------|
| Consent gate bypass via LLM context leakage | CRITICAL | Phase 7 | Not addressed |
| Consent fatigue from deny-by-default | CRITICAL | Phase 5 | Not addressed |
| AES-GCM IV reuse destroying encryption | CRITICAL | Phase 6 | Not addressed |
| Cross-agent prompt injection via provider messages | CRITICAL | Phase 7 | Not addressed |
| Hook dependency for async consent (OpenClaw limitation) | CRITICAL | Phase 7 | Mitigated by design (skill-internal flow) |

### Blockers

None currently.

### TODOs

- [x] Plan Phase 1 (`/gsd:plan-phase 1`)
- [x] Execute Phase 1 Plan 02 (entry points, hardening, tests)
- [x] Plan Phase 2 (`/gsd:plan-phase 2`)
- [x] Execute Phase 2 Plan 01 (CANS foundation modules)
- [x] Execute Phase 2 Plan 02 (activation gate)
- [x] Execute Phase 2 Plan 03 (tests)

## Session Continuity

**Last session:** 2026-02-22T02:51:16.977Z
**Stopped At:** Completed 03-03-PLAN.md (Phase 3 complete)
**What happened:** Executed Phase 3 Plan 03: Audit Integrity Service. TDD RED: 13 failing tests for service config, startup verification, periodic checks, stop lifecycle, flush-before-verify. GREEN: createAuditIntegrityService implementation with 60s periodic checks, flush-before-verify, error logging on chain break. Wired into OpenClaw entry point Step 8 with try/catch. Removed integrity-service.ts coverage exclusion. All 227 tests pass (214 existing + 13 new). Phase 3 (Audit Pipeline) is now complete.
**Next action:** Plan or execute Phase 4 (Onboarding and Agent Configuration)
**Open questions:** None blocking.

---
*Last updated: 2026-02-22T02:49:28Z*
