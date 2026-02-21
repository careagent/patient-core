# STATE: @careagent/patient-core

## Project Reference

**Core Value:** The patient is the ultimate authority over their health information -- nothing leaves their workspace without explicit consent, and their agent advocates for their stated preferences at every interaction.

**Architecture:** Hybrid OpenClaw plugin + dedicated `patientagent`. Plugin handles system concerns (CLI, hooks, audit, tool policy). Dedicated agent provides persistent clinical workspace with CANS.md and clinical skills.

**Key Constraint:** Zero runtime npm dependencies. No provider-core dependency. Synthetic data only.

## Current Position

**Phase:** 1 - Plugin Scaffolding and Platform Portability
**Plan:** 2 of 2 complete
**Status:** Milestone complete

```
[##------] 12% (1/8 phases complete, 2/2 Phase 1 plans done)
```

## Phase Status

| Phase | Status | Plans |
|-------|--------|-------|
| 1. Plugin Scaffolding and Platform Portability | Complete | 2/2 plans complete |
| 2. Patient CANS Schema and Activation Gate | Not started | TBD |
| 3. Audit Pipeline | Not started | TBD |
| 4. Onboarding and Agent Configuration | Not started | TBD |
| 5. Consent Engine | Not started | TBD |
| 6. Secure Channel Protocol | Not started | TBD |
| 7. Patient Skills and Defense Integration | Not started | TBD |
| 8. Integration Testing and Documentation | Not started | TBD |

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 2 |
| Plans failed | 0 |
| Requirements delivered | 9/69 |
| Test coverage | 93% (lines) |

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
- [ ] Determine whether Phase 2 and Phase 3 execute sequentially or in parallel
- [ ] Plan Phase 2 (`/gsd:plan-phase 2`)

## Session Continuity

**Last session:** 2026-02-21T22:07:31.306Z
**Stopped At:** Phase 2 context gathered
**What happened:** Executed Phase 1 Plan 02: implemented 6-layer hardening engine (tool-policy, exec-allowlist, cans-injection, docker-sandbox, consent-gate stub, data-minimization stub), three entry points (OpenClaw register with full lifecycle, standalone activate, core type re-exports), and comprehensive test suite (104 tests, 93%+ coverage). All tests pass, build produces 4 dist outputs, typecheck clean.
**Next action:** Plan Phase 2 (Patient CANS Schema and Activation Gate) or Phase 3 (Audit Pipeline) -- can run in parallel
**Open questions:** None blocking. Research flags documented for Phases 4, 5, 6. Provider-core v2 ChannelAdapter timeline TBD.

---
*Last updated: 2026-02-21T21:26:56Z*
