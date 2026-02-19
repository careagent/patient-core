# @careagent/patient-core

**The patient-side CareAgent plugin for OpenClaw.**

@careagent/patient-core transforms a standard OpenClaw personal AI agent into a patient-governed clinical agent. It is the patient's sovereign AI layer — managing their care network, maintaining access to their longitudinal health record, communicating with provider CareAgents on the patient's terms, and ensuring the patient is always in complete control of their own clinical data.

---

## Core Principle: The Patient Holds the Record

In the CareAgent ecosystem, the patient's clinical record does not live in a hospital system, an EMR, or a provider's database. It lives with the patient — in a locally-held, encrypted, append-only vault called the Patient Chart.

The patient's CareAgent is the interface to that record. It reads from and writes to the Patient Chart on the patient's behalf, manages who else can access it, and communicates with credentialed provider CareAgents through the cross-installation protocol defined by [careagent/axon](https://github.com/careagent/axon).

No clinical data passes through Axon. Everything flows directly between the patient's installation and the provider's installation, peer to peer, after a consent-gated handshake. The patient initiates all connections. Providers cannot contact the patient without the patient's CareAgent actively participating.

---

## What This Package Does

@careagent/patient-core is a pnpm plugin package that installs into an existing OpenClaw installation. It does not replace OpenClaw or modify its core. It activates a patient clinical layer on top of it.

When the plugin detects a `CANS.md` file in an agent's workspace, it:

- Activates patient identity and care network configuration
- Interfaces with the Patient Chart vault for all clinical record access
- Begins append-only audit logging of every agent action to `AUDIT.log`
- Enforces runtime hardening appropriate to the patient clinical context
- Manages the patient's access grant list and drives the authorized sync engine
- Activates the cross-installation communication protocol for provider CareAgent sessions
- Gates patient clinical skill loading against the patient's CANS.md configuration

When no `CANS.md` is present, the plugin takes no action. The agent runs as standard OpenClaw.

---

## Architecture

### The Plugin Is the Deterministic Layer

OpenClaw workspace files are the instructional layer — they tell the LLM who it is and how to behave. LLM behavior is probabilistic. The plugin is what makes the critical pieces deterministic.

Audit logging, Patient Chart access control, hardening enforcement, and the safety guard all run as code in-process with the Gateway — regardless of LLM behavior. The LLM handles the patient's clinical intelligence. The plugin handles governance.

### Single-Agent vs. Multi-Agent Mode

@careagent/patient-core works in both OpenClaw deployment modes.

**Single-agent mode** — the entire OpenClaw installation is dedicated to the patient's CareAgent. The simplest setup and appropriate for a patient who wants a clinical-only installation. No additional isolation configuration is required.

**Multi-agent mode** — the patient's CareAgent runs alongside other personal agents on the same installation (a general assistant, productivity agents, etc.). This is the expected configuration for most patients — their CareAgent is one brain among several on their local machine.

When running in multi-agent mode, the following isolation configuration is required:

- `agentToAgent` is disabled on the CareAgent's configuration
- `sessions_send` and `sessions_spawn` are denied in the per-agent tool policy
- Docker sandboxing provides process-level isolation, keeping clinical data isolated from other agents and applications on the device
- No other agent on the installation can reach the patient's CareAgent
- The patient's CareAgent communicates only through the cross-installation protocol with credentialed provider CareAgents through their Neuron endpoints

The `careagent init` onboarding process will ask which mode you are running and configure isolation automatically if multi-agent mode is selected.

### CANS: The Clinical Activation Kernel

`CANS.md` is a single file added to the agent's workspace that activates the entire patient clinical layer. It contains:

- Patient identity block
- Patient Chart vault location and access configuration
- Care network — the list of provider and organization Neuron endpoints the patient has established relationships with, consent terms, and relationship dates
- Consent configuration — cross-installation communication permissions
- Access grant configuration — authorized individuals and organizations with read access to the Patient Chart
- Hardening activation flags
- Audit activation flags

The existing OpenClaw workspace files remain untouched. `CANS.md` is purely additive.

### The Patient Chart Vault

The Patient Chart is a separate, locally-held, encrypted, append-only vault that is the patient's complete longitudinal health record. It lives independently of the CareAgent on the patient's device. The CareAgent reads from and writes to it through a defined local API — it does not contain the record.

The Patient Chart stores:

- All clinical encounter documentation written by credentialed provider CareAgents
- Medications, allergies, diagnoses, imaging results, lab results, surgical history
- The care network record — all provider and organization relationships, consent grants, and relationship events
- The access control list — all authorized individuals and organizations, their permission levels, and sync configurations
- All AUDIT.log entries from the patient's CareAgent

See [careagent/patient-chart](https://github.com/careagent/patient-chart) for full documentation on the vault architecture, encryption model, backup options, and local API.

---

## Installation

> **Note:** During the current development phase, installation is performed by developers using mock patient data. No real patient data or PHI is used at this stage.

Requires an existing OpenClaw installation.

```bash
openclaw plugins install @careagent/patient-core
```

This places the plugin into `~/.openclaw/extensions/careagent-patient-core/`, enables it in the plugin configuration, and makes the `careagent` CLI commands available.

```bash
openclaw gateway restart
careagent status
```

---

## Local Development

This project uses [pnpm](https://pnpm.io) as its package manager.

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Clone and install dependencies
git clone https://github.com/careagent/patient-core
cd patient-core
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

---

## Onboarding

Run the onboarding interview to initialize the patient's CareAgent:

```bash
careagent init
```

The onboarding interview collects:

- Patient name and basic identity
- Care network initialization — existing provider and organization relationships to establish
- Consent preferences — default consent terms for new care relationships
- Access grant configuration — individuals or organizations authorized to read the Patient Chart
- Backup preferences — how and where the Patient Chart vault should be backed up
- Emergency access setup — break-glass protocol defining who can access the record if the patient is incapacitated

All onboarding data is written to two places:

- **CANS.md** — the activation kernel in the workspace, containing patient identity, consent configuration, care network references, and Patient Chart access configuration.
- **Patient Chart vault** — the permanent, authoritative store for all identity, care network, access grant, and emergency access data. The Patient Chart is the source of truth. CANS.md is the activation reference.

After onboarding, the patient's CareAgent activates with their clinical identity on the next agent run.

---

## CLI Commands

```bash
careagent init              # Run the patient onboarding interview
careagent status            # Show active CANS, audit stats, care network status, sync status
```

---

## Workspace After Onboarding

| File | Source | Purpose |
|------|--------|---------|
| `SOUL.md` | OpenClaw + onboarding | Patient identity and persona |
| `AGENTS.md` | OpenClaw + onboarding | Clinical protocols and hard rules |
| `USER.md` | OpenClaw + onboarding | Patient preferences |
| `TOOLS.md` | OpenClaw | Tool usage instructions |
| `IDENTITY.md` | OpenClaw | Agent presentation |
| `MEMORY.md` | OpenClaw | Long-term memory |
| `HEARTBEAT.md` | OpenClaw | Monitoring loop |
| `BOOT.md` | OpenClaw | Startup checklist |
| `CANS.md` | CareAgent (generated by onboarding) | Patient clinical activation kernel |
| `AUDIT.log` | CareAgent (generated at runtime) | Immutable action log |

---

## Care Network

The patient's care network is the set of provider and organization relationships held in the Patient Chart. Each relationship record contains:

- Provider or organization identity and NPI
- Neuron endpoint for cross-installation communication
- Scope of the relationship
- Consent date and terms
- Write access grant (allowing the provider's CareAgent to write to the Patient Chart)

### Discovering a Provider

The patient's CareAgent can discover any registered provider or organization through the national Axon registry:

```bash
# Example — finding a provider by name or NPI through the CareAgent interface
careagent status --network
```

### Establishing a Relationship

1. Patient's CareAgent queries Axon for the provider or organization.
2. Axon returns the Neuron endpoint and current credential status.
3. Patient's CareAgent initiates a connection to the Neuron.
4. Neuron presents provider credentials and relationship terms.
5. Patient consents through their CareAgent.
6. Relationship record is written to the Patient Chart (immutable, timestamped).
7. Provider's Neuron endpoint is stored in CANS.md care network.
8. Clinical communication session is established peer to peer.

Future connections use the stored Neuron endpoint directly. Axon is not involved after the initial handshake.

---

## Patient Data Sovereignty

The patient is in complete control of their clinical data at the architecture level — not just the permission level. This means:

- The patient initiates all clinical connections. Providers cannot contact the patient without the patient's CareAgent actively participating.
- Clinical content flows peer to peer between installations. It never passes through Axon or any intermediary.
- The Patient Chart lives locally on the patient's device. It does not live on provider infrastructure.
- Write access to the Patient Chart is granted by the patient and revocable at any time.
- The patient controls who else can read their record through the access grant system.

---

## Authorized Access Grants

The patient can grant read-only access to their Patient Chart to individuals or organizations — family members, caregivers, healthcare power of attorney, legal counsel, or organizations. Each grant specifies:

- Permission level (read-only, or elevated for healthcare POA)
- Scope (full record or specific sections)
- Optional time limit

Every grant and revocation is written to the Patient Chart as an immutable, auditable event.

### Live Sync

Access grants are not one-time snapshots. When a new entry is written to the Patient Chart, the patient's CareAgent propagates the update silently to all authorized recipients according to their sync configuration. The sync engine handles offline scenarios — updates queue and retry when connectivity restores.

When access is revoked, sync stops immediately. No new entries propagate after revocation.

Every sync event is recorded in `AUDIT.log`.

---

## Audit Logging

Every action the patient's CareAgent takes is recorded in `AUDIT.log` from the first interaction:

- The action taken
- Timestamp
- Clinical context
- Outcome

Every blocked action is also recorded. `AUDIT.log` is append-only. Entries can never be modified or deleted. The audit log is also written to the Patient Chart vault for permanent retention.

---

## Runtime Hardening

Hardening ensures the patient's CareAgent cannot take actions outside its configured scope, even if prompted to. The same layered hardening model used in provider-core applies here, configured for the patient context:

- **Tool policy lockdown** — only tools required for the patient's clinical functions are permitted when CANS.md is active.
- **Exec approvals** — shell execution restricted to pre-approved binaries.
- **CANS Protocol injection** — clinical hard rules injected into the system prompt: no unauthorized Patient Chart access, no bypassing consent gates, no modifying audit logs.
- **Docker sandboxing** — process-level isolation keeping clinical data isolated from other applications on the device.
- **Safety guard** — `before_tool_call` hook intercepts every tool invocation and validates against CANS.md configuration.
- **Audit trail integration** — every hardening layer feeds into `AUDIT.log`.

---

## Patient Skills

Patient-specific clinical skills extend the patient CareAgent's capabilities — health record queries, care network management, appointment tracking, medication management, and more.

See [careagent/patient-skills](https://github.com/careagent/patient-skills) for available skills and installation instructions.

---

## Relationship to the Ecosystem

```
National Axon Network
        │
        ▼
  Organization Neuron          ← careagent/neuron
        │
        ▼
Cross-Installation Protocol    ← careagent/axon
        │
        ▼
Patient OpenClaw Gateway (local machine)
        │
        ├── main agent (standard OpenClaw)
        ├── other personal agents (standard OpenClaw)
        └── Patient Care Agent   ← @careagent/patient-core
                │
                ├── CANS.md (patient activation kernel)
                ├── AUDIT.log (immutable action log)
                ├── Patient Chart interface  ← careagent/patient-chart
                └── Patient Skills  ← careagent/patient-skills
```

---

## Repository Structure

```
careagent/patient-core/
├── src/
│   ├── index.ts              # Plugin entry point — register(api)
│   ├── activation/           # CANS.md parsing, validation, activation logic
│   ├── audit/                # AUDIT.log append-only logging
│   ├── hardening/            # Hardening layer implementation
│   ├── chart/                # Patient Chart vault interface
│   ├── onboarding/           # careagent init interview and CANS generation
│   ├── network/              # Care network management
│   ├── sync/                 # Authorized access sync engine
│   └── protocol/             # Cross-installation channel (client role)
├── skills/                   # Bundled core patient skills
├── templates/                # CANS.md templates for patient onboarding
├── test/                     # Test suites
├── docs/                     # Architecture and contribution guides
├── openclaw.plugin.json      # Plugin manifest
└── package.json              # pnpm package — OpenClaw as peer dependency
```

---

## Contributing

CareAgent is released under Apache 2.0. Contributions are welcome from clinicians, developers, patient advocates, and anyone committed to building trustworthy clinical AI infrastructure.

Before contributing, read the architecture guide in `docs/architecture.md` and the contribution guidelines in `CONTRIBUTING.md`.

Patient skill contributions belong in [careagent/patient-skills](https://github.com/careagent/patient-skills).

---

## Related Repositories

| Repository | Purpose |
|-----------|---------|
| [careagent/provider-core](https://github.com/careagent/provider-core) | Provider-side CareAgent plugin |
| [careagent/patient-chart](https://github.com/careagent/patient-chart) | Patient Chart vault |
| [careagent/neuron](https://github.com/careagent/neuron) | Organization-level Axon node |
| [careagent/axon](https://github.com/careagent/axon) | Open foundation network layer and protocol |
| [careagent/provider-skills](https://github.com/careagent/provider-skills) | Provider clinical skills registry |
| [careagent/patient-skills](https://github.com/careagent/patient-skills) | Patient clinical skills registry |

---

## License

Apache 2.0. See [LICENSE](LICENSE).

The patient's control over their own clinical data is a structural property of this architecture, not a policy. Every line of code in this repository is open, auditable, and improvable by the community it serves.
