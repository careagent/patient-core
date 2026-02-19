# Technology Stack

**Project:** @careagent/patient-core
**Researched:** 2026-02-18
**Overall Confidence:** HIGH

---

## Design Principle: Mirror Provider-Core, Extend for Patient Domain

patient-core's stack is not a blank-slate decision. Provider-core has established the foundational toolchain, and patient-core MUST match it for ecosystem coherence. The research question is narrow: **what does patient-core need on top of what provider-core already uses, and how do we satisfy the encryption/channel/consent requirements with zero runtime dependencies?**

The answer: Node.js 22's built-in `node:crypto` and Web Crypto API (`crypto.subtle`) provide everything patient-core needs for encryption, signing, hashing, and key management -- no npm packages required.

---

## Recommended Stack

### Core Runtime & Language

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | >=22.12.0 | Runtime | Match provider-core. LTS until April 2027. Built-in `crypto.subtle` (stable since v19, Ed25519/X25519 stable since v22.13.0), `node:readline/promises`, `node:fs`, `node:crypto` cover all patient-core needs without npm deps. | HIGH |
| TypeScript | ~5.7.0 | Language | Match provider-core. Latest patch is 5.7.3. TS 5.8/5.9 exist but provider-core pins ~5.7; do not diverge. | HIGH |
| pnpm | >=10.0.0 | Package manager | Match provider-core. Current latest is 10.30.0. v10 defaults to blocking install scripts -- good for clinical supply chain security. | HIGH |

### Build & Test

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| tsdown | ~0.20.0 | Bundler | Match provider-core. Current latest is 0.20.3. Bundles `yaml` into dist so it becomes a zero-dep runtime artifact. Also bundles any vendored code. Powered by Rolldown. | HIGH |
| vitest | ~4.0.0 | Test framework | Match provider-core. Current latest is 4.0.18. Fast, ESM-native, excellent TypeScript support. | HIGH |
| @vitest/coverage-v8 | ~4.0.0 | Coverage | Match provider-core. Current latest is 4.0.18. Required for 80% coverage threshold enforcement. | HIGH |

### Schema & Validation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @sinclair/typebox | ~0.34.0 | Schema validation | Match provider-core. Current latest is 0.34.48. Zero-dependency JSON Schema builder with static TypeScript type inference. Used for Patient CANS.md validation, channel message schemas, consent rule schemas, and audit entry schemas. Also used by OpenClaw for plugin configSchema. | HIGH |

### YAML & FHIR

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| yaml | ^2.8.2 | YAML 1.2 parser | Match provider-core. Bundled via tsdown into dist -- NOT a runtime dependency. Used to parse CANS.md YAML frontmatter. Current latest is 2.8.2. | HIGH |
| @medplum/fhirtypes | ~5.0.0 | FHIR R4 types | Match provider-core. Dev-only, types-only (no runtime code). Current latest is 5.0.9. Provides typed interfaces for Patient, Condition, MedicationStatement, AllergyIntolerance, etc. Patient-core needs these for typed health context representation in Share/Review actions. | HIGH |

### OpenClaw Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| openclaw | >=2026.1.0 | Plugin host | Optional peerDependency, match provider-core. Plugin SDK provides TypeScript interfaces for registration, CLI commands, background services, gateway RPC, and tool hooks. Current latest is 2026.2.2. Declared as optional peer dep -- patient-core must work without it (standalone/library mode). | HIGH |

---

## Patient-Core-Specific Needs (Beyond Provider-Core)

This is the critical section. Provider-core is a "single agent in a workspace" system. Patient-core adds three capabilities that provider-core does not need: **encryption**, **key management**, and **secure channel protocol**. All are satisfied by Node.js built-ins.

### Cryptography (Node.js Built-ins, Zero Dependencies)

| Capability | Node.js API | Algorithm | Purpose in patient-core |
|------------|-------------|-----------|------------------------|
| Message encryption | `crypto.subtle.encrypt/decrypt` | AES-256-GCM | Encrypt channel messages in transit. AES-GCM provides authenticated encryption (confidentiality + integrity). |
| Key agreement | `crypto.subtle.deriveKey` | X25519 + HKDF | Patient and provider agents derive a shared secret from their respective key pairs. X25519 is stable in Node 22.13.0+. HKDF stretches the shared secret into AES keys. |
| Message signing | `crypto.subtle.sign/verify` | Ed25519 | Sign outbound channel messages for non-repudiation. Ed25519 stable in Node 22.13.0+. Provider agent verifies patient's signature; patient agent verifies provider's signature. |
| Hash chain (audit) | `crypto.createHash` | SHA-256 | Hash-chained JSONL audit entries. Each entry includes the hash of the previous entry. Identical to provider-core's audit pipeline. |
| CANS integrity | `crypto.createHash` | SHA-256 | SHA-256 integrity check on every CANS.md load. Match provider-core pattern. |
| Random values | `crypto.getRandomValues` | N/A | Generate IVs for AES-GCM (12 bytes), nonces, and random identifiers. |
| UUID generation | `crypto.randomUUID` | RFC 4122 v4 | Unique identifiers for audit entries, channel messages, consent records. |
| Key export/import | `crypto.subtle.exportKey/importKey` | JWK format | Serialize keys for storage/exchange. JWK is the standard format for Web Crypto keys and is JSON-native (no binary encoding issues). |

**Confidence: HIGH** -- All APIs are Stability 2 (Stable) in Node.js 22. Verified against [Node.js v22 Web Crypto API docs](https://nodejs.org/docs/latest-v22.x/api/webcrypto.html) and [Node.js v22 Crypto docs](https://nodejs.org/docs/latest-v22.x/api/crypto.html).

### File System & I/O (Node.js Built-ins)

| Capability | Node.js API | Purpose in patient-core |
|------------|-------------|------------------------|
| Audit log writes | `fs.createWriteStream` (flags: 'a') | Append-only JSONL audit log. High-frequency writes need streaming, not `fs.appendFile`. |
| CANS.md read | `fs.promises.readFile` | Read Patient CANS.md on activation. |
| Workspace file ops | `fs.promises.*` | Read/write SOUL.md, AGENTS.md, USER.md during onboarding supplementation. |
| CLI interaction | `readline/promises` | Conversational onboarding interview. Built-in promise-based readline for question/answer flow. No need for inquirer or prompts packages. |
| Path handling | `node:path` | Cross-platform path resolution for workspace files. |

### Additional Dev Dependencies (patient-core Only)

patient-core needs **no additional npm dev dependencies beyond what provider-core uses**. The entire encryption and channel infrastructure is built on Node.js built-ins.

However, patient-core may benefit from one additional dev-only tool:

| Library | Version | Purpose | When to Add | Confidence |
|---------|---------|---------|-------------|------------|
| @vitest/coverage-v8 | ~4.0.0 | Coverage enforcement | Phase 1 (already matched from provider-core) | HIGH |

That is the complete list. No additional npm packages needed.

---

## What NOT to Use (and Why)

| Technology | Why Not |
|------------|---------|
| **tweetnacl / libsodium-wrappers** | Unnecessary. Node.js 22 crypto.subtle provides X25519, Ed25519, AES-GCM natively. Adding a crypto npm dep to clinical software introduces supply chain risk for zero benefit. |
| **jose (JWT library)** | Channel messages are not JWTs. The channel protocol uses direct Ed25519 signatures + AES-GCM encryption, not token-based auth. JWTs add complexity and size without value for agent-to-agent communication. |
| **inquirer / prompts / enquirer** | Runtime npm dependencies. Node.js `readline/promises` handles the conversational onboarding interview. The interaction is sequential question/answer, not complex form widgets. OpenClaw's CLI API (`registerCliCommand`) wraps the UX layer. |
| **winston / pino / bunyan** | Runtime dependencies. The audit pipeline is a custom hash-chained JSONL writer (3 functions: append, hash, verify). General-purpose loggers add features (log levels, transports, formatters) that are irrelevant to append-only tamper-evident audit logs. |
| **ajv / zod / yup** | TypeBox is the schema validator. Provider-core uses it, OpenClaw uses it for configSchema, and it generates both JSON Schema and TypeScript types from a single source. Adding a second validator creates schema drift. |
| **node-forge / crypto-js** | Obsolete now that Node.js has native Web Crypto. These libraries exist because browsers historically lacked crypto APIs. Node.js 22 has no such gap. |
| **protobuf / msgpack** | Channel messages are JSON. JSONL is the audit format. Binary serialization adds complexity for a protocol that needs to be human-inspectable for clinical audit. JSON + AES-GCM encryption is the right balance. |
| **express / fastify / koa** | patient-core is a CLI plugin, not an HTTP server. The secure channel transport mechanism is deferred to implementation research, but it will NOT be a REST API server embedded in the plugin. |
| **@careagent/provider-core** | Explicit exclusion. No dependency between the two packages. Shared concepts (audit format, CANS schema structure, platform adapter interface) are independently implemented. |
| **TypeScript 5.8+ or 5.9** | Provider-core pins ~5.7. Diverging TypeScript versions between ecosystem packages creates type compatibility issues. Stay locked to provider-core's version. |
| **Node.js native test runner** | Vitest is the test framework. Node.js has `node:test` built in, but vitest provides superior DX (watch mode, coverage integration, snapshot testing, mocking) and matches provider-core. |

---

## Provider-Core Compatibility Matrix

| Concern | Provider-Core | Patient-Core | Compatible? |
|---------|--------------|--------------|-------------|
| Node.js version | >=22.12.0 | >=22.12.0 | YES - identical |
| TypeScript version | ~5.7.0 | ~5.7.0 | YES - identical |
| Package manager | pnpm | pnpm | YES - identical |
| Bundler | tsdown ~0.20.x | tsdown ~0.20.x | YES - identical |
| Test framework | vitest ~4.0.x | vitest ~4.0.x | YES - identical |
| Schema validator | @sinclair/typebox ~0.34.x | @sinclair/typebox ~0.34.x | YES - identical |
| YAML parser | yaml ^2.8.2 (bundled) | yaml ^2.8.2 (bundled) | YES - identical |
| FHIR types | @medplum/fhirtypes ~5.0.x | @medplum/fhirtypes ~5.0.x | YES - identical |
| OpenClaw peer dep | >=2026.1.0 (optional) | >=2026.1.0 (optional) | YES - identical |
| Runtime npm deps | Zero | Zero | YES - identical |
| Module system | ESM ("type": "module") | ESM ("type": "module") | YES - identical |
| Audit format | Hash-chained JSONL | Hash-chained JSONL | YES - same format, independent impl |
| Channel messages | N/A (no channel in provider-core) | JSON over encrypted channel | YES - provider-core will consume patient-core's channel spec |

---

## Proposed package.json

```json
{
  "name": "@careagent/patient-core",
  "version": "0.1.0",
  "type": "module",
  "description": "OpenClaw plugin: patient-facing clinical agent with consent engine and secure channel",
  "engines": {
    "node": ">=22.12.0"
  },
  "peerDependencies": {
    "openclaw": ">=2026.1.0"
  },
  "peerDependenciesMeta": {
    "openclaw": {
      "optional": true
    }
  },
  "openclaw": {
    "extensions": ["./dist/index.js"]
  },
  "devDependencies": {
    "@medplum/fhirtypes": "~5.0.0",
    "@sinclair/typebox": "~0.34.0",
    "@vitest/coverage-v8": "~4.0.0",
    "tsdown": "~0.20.0",
    "typescript": "~5.7.0",
    "vitest": "~4.0.0",
    "yaml": "^2.8.2"
  }
}
```

This is intentionally identical to provider-core's devDependencies. The `openclaw` field and `peerDependencies` section are the only structural additions (provider-core likely has these too).

---

## Encryption Architecture Decision: X25519 + AES-256-GCM

This is the most consequential stack decision unique to patient-core. The rationale:

**Why X25519 (not ECDH P-256):**
- X25519 is purpose-built for key agreement. Constant-time by design (no timing side channels).
- Stable in Node.js 22.13.0+ (Stability 2).
- 32-byte keys (compact for JWK serialization in channel messages).
- Used by Signal Protocol, WireGuard, TLS 1.3. Battle-tested for secure messaging.
- P-256 is NIST-specified and fine, but X25519 is simpler and has fewer implementation pitfalls.

**Why AES-256-GCM (not AES-CBC or ChaCha20):**
- Authenticated encryption: provides confidentiality AND integrity in one operation. AES-CBC requires a separate HMAC step.
- 256-bit key length satisfies clinical data protection requirements.
- Stable, widely supported, hardware-accelerated on modern CPUs (AES-NI).
- 12-byte IV (nonce) generated via `crypto.getRandomValues`.
- GCM produces an authentication tag -- if the ciphertext is tampered with, decryption fails.

**Why Ed25519 (not ECDSA):**
- Deterministic signatures (no nonce reuse vulnerability, unlike ECDSA).
- Stable in Node.js 22.13.0+.
- Used by SSH, Signal, and most modern signing protocols.
- Compatible with X25519 key pairs (same curve family, Curve25519).

**Key Agreement Flow (simplified):**
```
Patient generates:  Ed25519 signing keypair + X25519 key agreement keypair
Provider generates: Ed25519 signing keypair + X25519 key agreement keypair

Key exchange:
  Patient sends:   X25519 public key (in channel setup message)
  Provider sends:  X25519 public key (in channel setup response)

Shared secret derivation:
  Both:  crypto.subtle.deriveBits({ name: 'X25519', public: otherPartyPublicKey }, ownPrivateKey)
  Both:  crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info }, sharedBits, { name: 'AES-GCM', length: 256 })

Message flow:
  Sender:  encrypt(AES-256-GCM, sharedKey, message) -> sign(Ed25519, senderPrivateKey, ciphertext)
  Receiver: verify(Ed25519, senderPublicKey, ciphertext) -> decrypt(AES-256-GCM, sharedKey, ciphertext)
```

**Confidence: HIGH** for algorithm selection. **MEDIUM** for the exact key exchange protocol -- the flow above is sound but the channel transport mechanism (how keys are physically exchanged) is deferred to Phase 3 research.

---

## Node.js 22 Built-in Capabilities Summary

The zero-runtime-deps constraint is achievable because Node.js 22 provides:

| Need | Built-in Module | Status |
|------|----------------|--------|
| Encryption (AES-GCM) | `crypto.subtle` | Stable |
| Key agreement (X25519) | `crypto.subtle` | Stable (v22.13.0+) |
| Signing (Ed25519) | `crypto.subtle` | Stable (v22.13.0+) |
| Hashing (SHA-256) | `crypto.createHash` | Stable |
| HMAC | `crypto.createHmac` | Stable |
| Random bytes/UUIDs | `crypto.getRandomValues`, `crypto.randomUUID` | Stable |
| Key export (JWK) | `crypto.subtle.exportKey` | Stable |
| File I/O | `node:fs/promises`, `node:fs` | Stable |
| Append-only writes | `fs.createWriteStream` | Stable |
| CLI interaction | `node:readline/promises` | Stable |
| Path handling | `node:path` | Stable |
| JSON parsing | Global `JSON` | Stable |
| Text encoding | Global `TextEncoder`/`TextDecoder` | Stable |
| Structured clone | Global `structuredClone` | Stable |
| Event handling | `node:events` | Stable |
| Timers | `node:timers/promises` | Stable |

Nothing is missing. No polyfills needed.

---

## Installation

```bash
# Initialize
pnpm init

# Core dev dependencies (identical to provider-core)
pnpm add -D typescript@~5.7.0 tsdown@~0.20.0 vitest@~4.0.0 @vitest/coverage-v8@~4.0.0 @sinclair/typebox@~0.34.0 yaml@^2.8.2

# FHIR types (dev only, types only)
pnpm add -D @medplum/fhirtypes@~5.0.0

# OpenClaw (optional peer dep, for type checking only in dev)
# Do NOT add as devDependency -- declare in peerDependencies with optional: true
```

---

## Version Verification Log

All versions verified via npm registry and official documentation on 2026-02-18:

| Package | Pinned | Latest Available | Source |
|---------|--------|-----------------|--------|
| Node.js | >=22.12.0 | 22.21.1 (LTS) | [nodejs.org](https://nodejs.org) |
| TypeScript | ~5.7.0 | 5.7.3 | [npm](https://www.npmjs.com/package/typescript) |
| tsdown | ~0.20.0 | 0.20.3 | [npm](https://www.npmjs.com/package/tsdown) |
| vitest | ~4.0.0 | 4.0.18 | [npm](https://www.npmjs.com/package/vitest) |
| @vitest/coverage-v8 | ~4.0.0 | 4.0.18 | [npm](https://www.npmjs.com/package/@vitest/coverage-v8) |
| @sinclair/typebox | ~0.34.0 | 0.34.48 | [npm](https://www.npmjs.com/package/@sinclair/typebox) |
| yaml | ^2.8.2 | 2.8.2 | [npm](https://www.npmjs.com/package/yaml) |
| @medplum/fhirtypes | ~5.0.0 | 5.0.9 | [npm](https://www.npmjs.com/package/@medplum/fhirtypes) |
| pnpm | >=10.0.0 | 10.30.0 | [npm](https://www.npmjs.com/package/pnpm) |
| OpenClaw | >=2026.1.0 | 2026.2.2 | [npm](https://www.npmjs.com/package/openclaw) |

---

## Sources

- [Node.js v22 Web Crypto API Documentation](https://nodejs.org/docs/latest-v22.x/api/webcrypto.html) -- Algorithm support matrix, stability status
- [Node.js v22 Crypto Module Documentation](https://nodejs.org/docs/latest-v22.x/api/crypto.html) -- createHash, createHmac, randomUUID stability
- [OpenClaw Plugin Documentation](https://docs.openclaw.ai/tools/plugin) -- Plugin manifest, registration API, SDK structure
- [OpenClaw Extensions Architecture (DeepWiki)](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins) -- Plugin lifecycle, slot types, TypeScript integration
- [tsdown npm](https://www.npmjs.com/package/tsdown) -- Version verification
- [vitest npm](https://www.npmjs.com/package/vitest) -- Version verification
- [@sinclair/typebox npm](https://www.npmjs.com/package/@sinclair/typebox) -- Version verification
- [@medplum/fhirtypes npm](https://www.npmjs.com/package/@medplum/fhirtypes) -- Version verification
- [pnpm 2025 blog](https://pnpm.io/blog/2025/12/29/pnpm-in-2025) -- v10 security-by-default, script blocking
- [AuditableLLM: Hash-Chain-Backed Audit Framework](https://www.mdpi.com/2079-9292/15/1/56) -- Hash chain JSONL performance characteristics
