# CLAUDE.md -- @careagent/patient-core

## Project Overview

Patient-core is the **patient-governed clinical agent** for the CareAgent ecosystem. It acts on behalf of the patient, enforcing consent posture (deny-by-default or allow-by-default), managing a trust list of approved providers, adapting communication to health literacy levels, and maintaining bilateral correlation IDs for all cross-agent interactions. It extends provider-core's 4-layer hardening to 6 layers with patient-specific consent-gate and data-minimization layers.

## The Irreducible Risk Hypothesis

Clinical AI agents carry irreducible risk of harm. Patient-core manages this risk as the **patient's autonomous advocate** -- it enforces the patient's consent posture on every tool call, gates all provider interactions through the trust list, and applies data minimization to outbound information sharing. Layer 5 (consent-gate) enforces deny-by-default, allow-trusted, or custom postures with per-action consent, expiration, and revocation. Layer 6 (data-minimization) is an allow-all stub awaiting specification. The patient's CANS.md (`identity_type: 'patient'`) is the single source of truth for behavioral configuration.

## Directory Structure

```
patient-core/
  skills/                # Skill subdirectories
  openclaw.plugin.json   # OpenClaw plugin descriptor
  src/
    activation/          # CANS.md parser, TypeBox schema (identity_type: 'patient'), gate
    adapters/            # Platform adapters (openclaw/, standalone/)
      detect.ts          # Auto-detect runtime environment
    audit/               # Append-only audit pipeline + entry schema
    chart/               # Chart integration types
    cli/                 # CLI commands (init, status)
    consent/             # Consent engine (schemas, engine, prompts)
    credentials/         # Credential validator
    entry/               # Entry points (openclaw.ts, standalone.ts, core.ts)
    hardening/           # 6-layer security engine (extends provider-core's 4)
      layers/            # tool-policy, exec-allowlist, cans-injection, docker-sandbox,
                         # consent-gate (L5), data-minimization (L6)
      engine.ts          # Layer orchestrator (short-circuit-on-deny)
      canary.ts          # before_tool_call canary
    neuron/              # Neuron client
    onboarding/          # Patient onboarding wizard
    protocol/            # Protocol server
    refinement/          # Simplified refinement engine (observation + proposals)
    skills/              # Skill loader (6-step pipeline)
    vendor/yaml/         # YAML serializer
    index.ts             # Barrel export
  test/
    fixtures/
      cans/              # Test CANS.md fixtures
    integration/         # Integration tests
    unit/                # Unit tests mirroring src/ structure
```

## Commands

```bash
pnpm build             # Build with tsdown
pnpm dev               # Watch mode: tsdown --watch
pnpm test              # Run tests: vitest run
pnpm test:watch        # Watch mode: vitest
pnpm test:coverage     # Coverage: vitest run --coverage
pnpm typecheck         # Type check: tsc --noEmit
pnpm clean             # Remove dist/
```

## Code Conventions

- **ESM-only** -- `"type": "module"` in package.json. All imports use `.js` extensions.
- **TypeBox for all schemas** -- `@sinclair/typebox` (devDependency). Patient CANS schema defines `identity_type: 'patient'` discriminator, consent posture, trust list, health literacy levels.
- **TypeScript types derived from TypeBox** -- `type Foo = Static<typeof FooSchema>`. Do NOT define standalone interfaces when a TypeBox schema exists.
- **Barrel exports** -- every subdirectory has an `index.ts`. Three entry points: `./openclaw`, `./standalone`, `./core`.
- **Naming**: PascalCase for classes and schemas (suffix `Schema`), camelCase for functions, UPPER_SNAKE for constants.
- **Semicolons** -- this repo uses semicolons.
- **Node.js >= 22.12.0** required.
- **pnpm** as package manager.
- **Vitest** for testing. ~227 tests.

## Anti-Patterns

- **Do NOT make hardening configurable via CANS.** Hardening is always on, deterministic, and hardcoded. Never toggled by user configuration.
- **Do NOT bypass the consent posture.** If `consent_posture` is `'deny'`, every action requires explicit consent. If `'allow'`, only explicitly denied actions are blocked.
- **Do NOT store PHI in CANS.md.** CANS.md contains NO personal health information and NO personally identifiable information. All health data resides in the patient chart (patient-chart package).
- **Do NOT skip trust list validation** for provider interactions. Only providers with `trust_level: 'active'` in the trust list can interact.
- **Do NOT implement Layer 6 beyond stub** until Phase 5 specification is complete. The current allow-all stub for data-minimization is intentional.
- **Do NOT modify scope fields via refinement proposals.** Identity, consent posture, and trust list entries are protected.
- **Do NOT use relative imports without `.js` extension.** ESM requires explicit extensions.

## Key Technical Details

### Patient CANS.md Schema

`src/activation/cans-schema.ts` -- key differences from provider-core:

- **`identity_type: 'patient'`** -- discriminator field (must be `'patient'` for activation)
- **`consent_posture`** -- `'deny'` (deny-by-default) or `'allow'` (allow-by-default)
- **`health_literacy_level`** -- controls communication complexity
- **Trust list** -- array of `TrustListEntry` objects with: `npi`, `role`, `trust_level` (`pending` | `active` | `suspended` | `revoked`), `provider_name`, `organization`, `last_changed`
- **Autonomy tiers** per action type: `supervised`, `autonomous`, `manual`
- **Advocacy** boundaries
- **Communication** preferences (language, contact hours)

### 6-Layer Runtime Hardening

`src/hardening/engine.ts` -- extends provider-core's 4 layers:

1. **Tool Policy** -- allowlist of permitted tool names
2. **Exec Allowlist** -- restrict shell/exec commands
3. **CANS Injection** -- inject protocol rules from CANS.md
4. **Docker Sandbox** -- container isolation enforcement
5. **Consent Gate** -- per-action consent checking against consent posture (deny-all, allow-trusted, custom)
6. **Data Minimization** -- (stub, Phase 5) outbound data filtering

All 6 layers are wired into the pipeline and execute in order with short-circuit-on-deny.

### Bilateral Correlation IDs

Every cross-agent interaction (patient-to-provider, patient-to-neuron) carries a bilateral correlation ID that both sides can verify, enabling tamper-evident interaction tracking.

### Trust List Management

Trust levels: `pending` (handshake in progress), `active` (full access), `suspended` (temporarily blocked), `revoked` (permanently removed). Trust level changes are timestamped via `last_changed` ISO 8601 field.

### Platform Adapters

- **OpenClaw** (`src/adapters/openclaw/`) -- runs as an OpenClaw plugin (peer dep `>=2026.1.0`)
- **Standalone** (`src/adapters/standalone/`) -- runs as an independent Node.js process
- Auto-detection via `src/adapters/detect.ts`

### A2A Protocol Integration (Planned)

Patient-core is becoming an **A2A Client**. This means:

- **A2A Client** -- sends requests to Axon (enrollment, discovery) and Neuron (provider interactions)
- **Provider discovery via Agent Cards** -- discover providers through Axon's A2A Agent Card registry
- **Consent engine integrated with A2A** -- consent posture enforced on A2A Task interactions
- **Encrypted communication** -- patient-chart encryption integrated with A2A message payloads
- **Health-literacy onboarding** -- enrollment flow via A2A Tasks with Axon

The existing consent engine, hardening layers, trust list management, and CANS.md activation are preserved. A2A replaces the transport layer, not the patient governance.

**SDK:** `@a2a-js/sdk` (v0.3.10, published by Google). Wrap in an adapter layer to insulate from pre-1.0 API changes.
