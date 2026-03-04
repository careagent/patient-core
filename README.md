# @careagent/patient-core

> Source: [github.com/careagent/patient-core](https://github.com/careagent/patient-core)

Patient-side clinical agent plugin. A TypeScript plugin that transforms any AI agent workspace into a patient-governed clinical agent with consent enforcement, encrypted communication, and sovereign health record access. Part of the CareAgent ecosystem.

## Why

Traditional healthcare systems store patient records within hospital systems, limiting patient access and control. Patient-core inverts this model — the patient's CareAgent manages their care network and maintains access to their longitudinal health record via patient-chart, communicating with provider agents on patient-determined terms. The plugin activates clinical features when `CANS.md` exists in the workspace.

## Features

- **Patient CANS.md activation** — TypeBox schema validation with patient identity, care network, consent configuration, and health literacy settings
- **Append-only audit trail** — hash-chained JSONL logging captures all actions, blocked actions, and consent decisions with bilateral correlation IDs
- **Platform portability** — PlatformAdapter abstraction supporting OpenClaw and standalone entry points
- **Self-contained and sandboxed** — operates entirely within the host agent framework with no external service dependencies

### Planned (v2)

- Conversational onboarding interview at appropriate health literacy levels
- Deny-by-default consent engine with per-provider trust management
- Encrypted secure channel using AES-256-GCM with Ed25519 signatures
- Integration with @careagent/patient-skills for clinical capabilities (sharing, requesting, reviewing, consenting)

## Installation

```bash
openclaw plugins install @careagent/patient-core
openclaw gateway restart
```

Requires Node.js >= 22.12.0.

## Usage

Three import patterns available: OpenClaw plugin registration, standalone programmatic activation, and core library utilities for schemas and types.

## Tech Stack

TypeScript (~5.7), Node.js (>=22.12.0), pnpm, vitest (~4.0), tsdown (~0.20), @sinclair/typebox (~0.34).

## Roadmap

Eight phases from plugin scaffolding through integration testing and documentation. Phases 1-3 complete; phases 4-8 planned.

## License

Apache 2.0
