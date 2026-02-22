# @careagent/patient-core

Patient-side clinical agent plugin. A TypeScript plugin that transforms any AI agent workspace into a patient-governed clinical agent with consent enforcement, encrypted communication, and sovereign health record access.

Part of the [CareAgent](https://github.com/careagent) ecosystem.

## Why

In traditional healthcare, the patient's record lives inside hospital systems. The patient has limited access, limited control, and no portability.

**patient-core** inverts this. The patient's CareAgent manages their care network, maintains access to their longitudinal health record via [patient-chart](https://github.com/careagent/patient-chart), and communicates with provider CareAgents on the patient's terms. When `CANS.md` is present in the workspace, the clinical layer activates. When absent, the plugin takes no action.

## Features

- **Patient CANS.md activation** — TypeBox schema validation with patient identity, care network, consent posture, and health literacy configuration
- **Append-only audit trail** — hash-chained JSONL log captures every action, blocked action, and consent decision with bilateral correlation IDs
- **Platform portability** — PlatformAdapter abstraction with OpenClaw and standalone entry points
- **Zero runtime dependencies** — all runtime needs from Node.js built-ins and bundled TypeBox

### Planned (v2)

- **Conversational onboarding** — 9-stage interview at the patient's health literacy level, generating CANS.md and dedicated agent workspace
- **Deny-by-default consent engine** — per-provider trust management, risk-stratified tiers, always-manual consent enforcement
- **Encrypted secure channel** — AES-256-GCM with Ed25519 signatures, file-based mailbox transport, consent-gated messaging
- **Patient clinical skills** — Share, Request, Review, and Consent skills with skill-internal two-phase consent flow

## Install

```bash
openclaw plugins install @careagent/patient-core
openclaw gateway restart
```

Requires Node.js >= 22.12.0.

## Usage

```typescript
// OpenClaw plugin (auto-registered)
import { register } from '@careagent/patient-core';

// Standalone (programmatic)
import { activate } from '@careagent/patient-core/standalone';

// Core library (types and utilities only)
import {
  PatientCANSSchema, AuditEntrySchema,
  createActivationGate, createAuditPipeline,
} from '@careagent/patient-core/core';
```

## Development

```bash
git clone https://github.com/careagent/patient-core
cd patient-core
pnpm install

pnpm test           # Run tests with coverage
pnpm typecheck      # Type-check without emitting
pnpm build          # Build to dist/
```

## Project Structure

```
src/
  index.ts            # Package entry point (OpenClaw plugin register)
  entry/              # Entry points (openclaw, standalone, core)
  activation/         # CANS.md parsing, schema validation, activation gate
  adapters/           # PlatformAdapter interface (OpenClaw, standalone)
  audit/              # Hash-chained JSONL audit pipeline
  chart/              # Patient Chart vault interface
  cli/                # CLI command scaffolding
  credentials/        # Credential types and validation stubs
  hardening/          # Runtime hardening stubs
  neuron/             # Neuron client stub
  onboarding/         # Onboarding interview stubs
  protocol/           # Cross-installation protocol stubs
  refinement/         # CANS refinement stubs
  skills/             # Patient skill framework stubs
  vendor/             # Bundled YAML parser
test/
  unit/               # Unit tests (vitest)
  integration/        # Integration tests
skills/               # Patient clinical skills directory
```

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | ~5.7 | Language |
| Node.js | >=22.12.0 | Runtime |
| pnpm | latest | Package manager |
| vitest | ~4.0 | Testing |
| tsdown | ~0.20 | Build (ESM) |
| @sinclair/typebox | ~0.34 | Runtime schema validation |

## Roadmap

- [x] **Phase 1** — Plugin scaffolding and platform portability
- [x] **Phase 2** — Patient CANS schema and activation gate
- [x] **Phase 3** — Audit pipeline
- [ ] **Phase 4** — Onboarding and agent configuration
- [ ] **Phase 5** — Consent engine
- [ ] **Phase 6** — Secure channel protocol
- [ ] **Phase 7** — Patient skills and defense integration
- [ ] **Phase 8** — Integration testing and documentation

## Related Repositories

| Repository | Purpose |
|-----------|---------|
| [@careagent/provider-core](https://github.com/careagent/provider-core) | Provider-side CareAgent plugin |
| [@careagent/patient-chart](https://github.com/careagent/patient-chart) | Patient Chart vault |
| [@careagent/neuron](https://github.com/careagent/neuron) | Organization-level Axon node |
| [@careagent/axon](https://github.com/careagent/axon) | Open foundation network layer |
| [@careagent/provider-skills](https://github.com/careagent/provider-skills) | Provider clinical skills registry |
| [@careagent/patient-skills](https://github.com/careagent/patient-skills) | Patient clinical skills registry |

## License

[Apache 2.0](LICENSE)
