# Phase 1: Plugin Scaffolding and Platform Portability - Research

**Researched:** 2026-02-21
**Domain:** TypeScript plugin scaffolding, OpenClaw plugin system, platform adapter pattern, zero-dependency ESM builds
**Confidence:** HIGH

## Summary

Phase 1 is a **direct mirror** of provider-core's Phase 1-2 foundation. Provider-core at `/Users/medomatic/Documents/Projects/provider-core/` is the reference implementation, and its patterns have been thoroughly analyzed. The scaffolding for patient-core is structurally identical: same project layout, same build toolchain (tsdown ~0.20.0, ESM-only), same test framework (vitest ~4.0.0), same schema validation (TypeBox ~0.34.0), same plugin registration pattern (openclaw.plugin.json + package.json `openclaw.extensions` field), same three entry points, same PlatformAdapter interface, and same graceful degradation approach.

The key technical decisions are already locked by provider-core's proven implementation. The only patient-specific additions in Phase 1 are: (a) empty stub directories for patient-specific subsystems (consent, channel, chart), (b) a `registerHook(name, handler)` extensibility method on PlatformAdapter for future patient-specific hooks, and (c) empty hardening layer stubs for consent-gate and data-minimization that return allow-all until Phase 5.

**Primary recommendation:** Copy provider-core's exact project structure, configuration files, adapter implementations, entry point patterns, and test structure. Modify only what the CONTEXT.md decisions specify as different (package name, plugin ID, stub directories, registerHook method). Do not innovate on infrastructure -- mirror what works.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Core Principle: Mirror Provider-Core** -- patient-core mirrors @careagent/provider-core's structure, patterns, and conventions as closely as possible. The codebases share ~80% identical infrastructure. Reference implementation: @careagent/provider-core at /Users/medomatic/Documents/Projects/provider-core/
- **Project Structure** -- Mirror provider-core's exact directory layout: src/adapters/, src/activation/, src/audit/, src/entry/, src/hardening/, src/credentials/, src/skills/, src/onboarding/, src/refinement/, src/protocol/, src/neuron/, src/cli/, src/vendor/. Add src/chart/ with a types.ts stub. Same test/ directory structure mirroring src/.
- **Naming** -- Package: `@careagent/patient-core`, Plugin display name: `CareAgent`, CLI commands: `careagent init`, `careagent status`, Plugin ID: `@careagent/patient-core`
- **Build and Tooling** -- tsdown ~0.20.0, ESM-only, Node >=22.12.0, TypeBox ~0.34.0, vitest ~4.0.0, TypeScript ~5.7.0, zero runtime npm deps, OpenClaw as optional peer dependency (>=2026.1.0), four tsdown entry points, same package.json exports map
- **Plugin Manifest** -- id: `@careagent/patient-core`, name: `CareAgent`, skills: `[]` (empty array), commands and hooks registered at runtime
- **Entry Points** -- OpenClaw (register(api)), Standalone (activate()), Core (pure type re-exports), Default (re-exports OpenClaw)
- **Platform Adapter** -- Same PlatformAdapter interface as provider-core with all methods. Add generic `registerHook(name, handler)`. Same duck-typing detection, same graceful degradation, same standalone no-op adapter.
- **Hardening Layers** -- Same 4 layers as provider-core plus empty stubs for consent-gate.ts and data-minimization.ts (allow-all until Phase 5). Same ordered pipeline pattern.
- **Stubs** -- src/protocol/ and src/neuron/ stubs matching provider-core. src/chart/types.ts stub for patient-chart vault interface.

### Claude's Discretion
- Exact file naming within directories (following provider-core conventions)
- Internal module organization where provider-core patterns apply directly
- Test fixture structure
- TypeScript strict mode configuration details

### Deferred Ideas (OUT OF SCOPE)
- `patientagent chart status` CLI command -- future phase
- Channel spec ownership and implementation -- Phase 6
- Consent engine and data minimization layers -- Phase 5 (empty stubs scaffolded in Phase 1)
- Patient-specific CANS.md schema fields -- Phase 2
- Patient-specific onboarding stages -- Phase 4
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLUG-01 | Plugin manifest (`openclaw.plugin.json`) declares patient-core with extensions, skills directory, and hook registrations | Provider-core's manifest is the exact template. Set `id: "@careagent/patient-core"`, `name: "CareAgent"`, `skills: []`, `commands: []`, `hooks: []`. Package.json needs `openclaw.extensions: ["./dist/index.js"]`. |
| PLUG-02 | Plugin registers via OpenClaw's extension API on install (CLI commands, hooks, services, skills) | Provider-core's `src/entry/openclaw.ts` `register(api)` function is the pattern. API object provides `registerCli()`, `on()`, `registerService()`, `registerCommand()`. All wrapped in try/catch. |
| PLUG-03 | PlatformAdapter abstracts all OpenClaw interactions (duck-typed, no direct imports) | Provider-core's `src/adapters/types.ts` defines the interface. `src/adapters/openclaw/index.ts` wraps raw API. `src/adapters/standalone/index.ts` provides no-op fallback. All methods use try/catch for graceful degradation. |
| PLUG-04 | Zero runtime npm dependencies -- all runtime needs from Node.js built-ins, YAML bundled via tsdown | Provider-core's `package.json` has zero `dependencies` field. `yaml` is a devDependency bundled by tsdown into dist. Verify with `package.json` check in tests. tsdown config uses `external: ['openclaw', 'openclaw/*']`. |
| PLUG-05 | Graceful degradation when OpenClaw hooks unavailable (try/catch -> degraded status, never crash) | Provider-core wraps every `raw.on()`, `raw.registerCli()`, `raw.registerService()`, `raw.registerCommand()`, `raw.log()` call in try/catch. Missing methods log warnings and fall through to no-ops. Canary pattern detects if hooks never fire. |
| PORT-01 | PlatformAdapter interface independently implemented (same interface as provider-core, no shared code) | Direct copy of interface from provider-core `src/adapters/types.ts`. Independent implementation -- zero imports from provider-core. Add `registerHook(name, handler)` method. |
| PORT-02 | Duck-type platform detection -- probe for APIs, never import OpenClaw directly | Provider-core's `src/adapters/detect.ts`: `typeof raw?.registerCli === 'function' && typeof raw?.on === 'function'` returns 'openclaw', else 'standalone'. |
| PORT-03 | Platform-specific workspace file profiles for supplementation | Provider-core's `src/onboarding/workspace-profiles.ts` defines profiles per platform (openclaw, agents-standard, standalone). Stub with same structure; content generation deferred to Phase 4. |
| PORT-04 | Three entry points: OpenClaw (plugin), standalone (direct), core (types only) | Provider-core's `src/entry/` directory with openclaw.ts, standalone.ts, core.ts. tsdown config has 4 entries (index.ts + 3 entry points). Package.json `exports` map with `.`, `./openclaw`, `./standalone`, `./core`. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.7.0 | Language | Match provider-core pin; latest patch 5.7.3 |
| tsdown | ~0.20.0 | Bundler | Match provider-core; latest 0.20.3; powered by Rolldown; bundles devDeps into dist for zero-runtime-dep output |
| vitest | ~4.0.0 | Test runner | Match provider-core; ESM-native; latest 4.0.18 |
| @vitest/coverage-v8 | ~4.0.0 | Coverage | Match provider-core; V8-based coverage for 80% threshold enforcement |
| @sinclair/typebox | ~0.34.0 | Schema validation | Match provider-core; TypeBox 0.34.x generates JSON Schema + TypeScript types from single source; used by OpenClaw for `configSchema` |
| yaml | ^2.8.2 | YAML parser | Match provider-core; bundled by tsdown (devDependency, not runtime); ISC license, zero-dependency |
| Node.js | >=22.12.0 | Runtime | Match provider-core; LTS until April 2027; built-in crypto.subtle, readline/promises |
| pnpm | >=10.0.0 | Package manager | Match provider-core; v10 blocks install scripts by default |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| openclaw | >=2026.1.0 | Plugin host | Optional peerDependency; declared but never imported directly; plugin API accessed only via duck-typed `api` parameter |

### Alternatives Considered

None. All stack choices are locked by the provider-core mirror decision. No alternatives should be explored.

**Installation:**
```bash
pnpm init
pnpm add -D typescript@~5.7.0 tsdown@~0.20.0 vitest@~4.0.0 @vitest/coverage-v8@~4.0.0 @sinclair/typebox@~0.34.0 yaml@^2.8.2
```

## Architecture Patterns

### Recommended Project Structure

```
@careagent/patient-core/
├── .gitignore                    # node_modules/, dist/, coverage/, *.tsbuildinfo, .DS_Store
├── .npmrc                        # shamefully-hoist=false, strict-peer-dependencies=false
├── openclaw.plugin.json          # Plugin manifest
├── package.json                  # Zero runtime deps, ESM, exports map
├── tsconfig.json                 # Strict, ES2023, NodeNext
├── tsdown.config.ts              # 4 entry points, ESM, DTS, external openclaw
├── vitest.config.ts              # 80% coverage thresholds
├── src/
│   ├── index.ts                  # Default: re-exports OpenClaw plugin
│   ├── entry/
│   │   ├── openclaw.ts           # register(api) plugin entry
│   │   ├── standalone.ts         # activate() standalone entry
│   │   └── core.ts               # Pure type re-exports
│   ├── adapters/
│   │   ├── types.ts              # PlatformAdapter interface + event types
│   │   ├── detect.ts             # Duck-type platform detection
│   │   ├── index.ts              # Module re-exports
│   │   ├── openclaw/
│   │   │   └── index.ts          # OpenClaw adapter (try/catch everything)
│   │   └── standalone/
│   │       └── index.ts          # Standalone adapter (no-ops + console log)
│   ├── activation/
│   │   ├── gate.ts               # ActivationGate class (stub for Phase 2)
│   │   ├── cans-parser.ts        # YAML frontmatter parser
│   │   ├── cans-integrity.ts     # SHA-256 integrity check
│   │   └── cans-schema.ts        # TypeBox schema (stub for Phase 2)
│   ├── audit/
│   │   ├── entry-schema.ts       # Audit entry TypeBox schema
│   │   ├── writer.ts             # Hash-chained JSONL writer
│   │   ├── pipeline.ts           # AuditPipeline high-level API
│   │   └── integrity-service.ts  # Background chain verifier
│   ├── hardening/
│   │   ├── types.ts              # HardeningEngine, layer types
│   │   ├── engine.ts             # Layer pipeline orchestrator
│   │   ├── index.ts              # Module re-exports
│   │   ├── canary.ts             # Hook liveness canary
│   │   └── layers/
│   │       ├── tool-policy.ts    # Layer 1: permitted actions whitelist
│   │       ├── exec-allowlist.ts # Layer 2: binary execution whitelist
│   │       ├── cans-injection.ts # Layer 3: protocol injection at bootstrap
│   │       ├── docker-sandbox.ts # Layer 4: container detection (report-only)
│   │       ├── consent-gate.ts   # Layer 5 STUB: allow-all (Phase 5)
│   │       └── data-minimization.ts # Layer 6 STUB: allow-all (Phase 5)
│   ├── cli/
│   │   ├── commands.ts           # registerCLI function
│   │   ├── init-command.ts       # Stub (Phase 4)
│   │   ├── status-command.ts     # Stub (Phase 4)
│   │   ├── io.ts                 # Terminal I/O abstraction
│   │   └── prompts.ts            # Prompt utilities (stub)
│   ├── credentials/
│   │   ├── index.ts              # Re-exports
│   │   ├── types.ts              # CredentialValidator types
│   │   └── validator.ts          # Credential validator (stub)
│   ├── skills/
│   │   ├── index.ts              # Re-exports
│   │   ├── types.ts              # Skill types
│   │   ├── loader.ts             # Skill loader (stub)
│   │   ├── manifest-schema.ts    # Skill manifest TypeBox schema
│   │   ├── integrity.ts          # Skill file integrity check
│   │   └── version-pin.ts        # Skill version pinning
│   ├── onboarding/
│   │   ├── workspace-profiles.ts # Platform-specific file profiles
│   │   ├── workspace-content.ts  # Content generators (stub)
│   │   ├── workspace-writer.ts   # File writer (stub)
│   │   ├── engine.ts             # Interview engine (stub)
│   │   ├── stages.ts             # Interview stages (stub)
│   │   ├── defaults.ts           # Default values (stub)
│   │   ├── review.ts             # Review flow (stub)
│   │   └── cans-generator.ts     # CANS.md generator (stub)
│   ├── refinement/
│   │   ├── index.ts              # Re-exports
│   │   ├── types.ts              # Refinement types (stub)
│   │   └── refinement-engine.ts  # Refinement engine factory (stub)
│   ├── protocol/
│   │   ├── index.ts              # Re-exports
│   │   ├── types.ts              # ProtocolServer types (stub)
│   │   └── server.ts             # Protocol server factory (stub -- "not yet implemented")
│   ├── neuron/
│   │   ├── index.ts              # Re-exports
│   │   ├── types.ts              # NeuronClient types (stub)
│   │   └── client.ts             # Neuron client factory (stub -- "not yet implemented")
│   ├── chart/
│   │   └── types.ts              # Patient-chart vault interface contract (read, write, access check)
│   └── vendor/
│       └── yaml/
│           └── index.ts          # Re-export parseYAML, stringifyYAML from 'yaml'
├── skills/                       # Empty (skills come in Phase 7)
└── test/
    ├── smoke.test.ts             # Smoke: exports register function, accepts mock API
    ├── fixtures/                  # Test fixtures
    ├── unit/
    │   ├── adapters/
    │   │   ├── detect.test.ts
    │   │   ├── openclaw/
    │   │   │   └── openclaw-adapter.test.ts
    │   │   └── standalone.test.ts
    │   ├── activation/           # Stubs tested in Phase 2
    │   ├── audit/
    │   │   ├── writer.test.ts
    │   │   ├── pipeline.test.ts
    │   │   └── integrity-service.test.ts
    │   ├── hardening/
    │   │   ├── hardening.test.ts
    │   │   ├── canary.test.ts
    │   │   └── layers/
    │   │       ├── tool-policy.test.ts
    │   │       ├── exec-allowlist.test.ts
    │   │       ├── cans-injection.test.ts
    │   │       ├── docker-sandbox.test.ts
    │   │       ├── consent-gate.test.ts
    │   │       └── data-minimization.test.ts
    │   └── ...                   # Mirror src/ structure
    └── integration/
        └── plugin.test.ts        # Plugin lifecycle, manifest, registration
```

### Pattern 1: OpenClaw Plugin Registration

**What:** Default export from index.ts is a `register(api: unknown)` function. OpenClaw discovers it via `package.json` `openclaw.extensions` field pointing to `./dist/index.js`.

**When:** Always -- this is how OpenClaw loads plugins.

**Example (from provider-core `src/entry/openclaw.ts`):**
```typescript
// Source: provider-core/src/entry/openclaw.ts
export default function register(api: unknown): void {
  const adapter = createAdapter(api);
  const workspacePath = adapter.getWorkspacePath();
  const audit = new AuditPipeline(workspacePath);
  registerCLI(adapter, workspacePath, audit);

  const gate = new ActivationGate(workspacePath, (entry) => audit.log({...}));
  const result = gate.check();

  if (!result.active || !result.document) {
    audit.log({ action: 'activation_check', actor: 'system', outcome: 'inactive', ... });
    adapter.log('info', `[CareAgent] Clinical mode inactive: ${result.reason}`);
    return;
  }

  // Clinical mode active -- wire hardening, skills, services
  const engine = createHardeningEngine();
  engine.activate({ cans: result.document, adapter, audit });
  // ... register background services
}
```

### Pattern 2: Graceful Degradation via Try/Catch Wrapping

**What:** Every interaction with the OpenClaw API object is wrapped in try/catch. Missing methods produce warnings, not crashes.

**When:** Every method in the OpenClaw adapter.

**Example (from provider-core `src/adapters/openclaw/index.ts`):**
```typescript
// Source: provider-core/src/adapters/openclaw/index.ts
onBeforeToolCall(handler: ToolCallHandler): void {
  try {
    if (typeof raw?.on === 'function') {
      raw.on('before_tool_call', handler);
      log('info', 'Registered before_tool_call handler');
    } else {
      log('warn', 'Cannot register before_tool_call handler: api.on is not available');
    }
  } catch (err) {
    log('warn', 'Failed to register before_tool_call handler', err);
  }
},
```

### Pattern 3: Duck-Type Platform Detection

**What:** Detect OpenClaw vs standalone by checking for the presence of specific functions on the API object. Never import OpenClaw types directly.

**When:** Platform detection at registration time.

**Example (from provider-core `src/adapters/detect.ts`):**
```typescript
// Source: provider-core/src/adapters/detect.ts
export function detectPlatform(api: unknown): DetectedPlatform {
  const raw = api as any;
  if (
    typeof raw?.registerCli === 'function' &&
    typeof raw?.on === 'function'
  ) {
    return 'openclaw';
  }
  return 'standalone';
}
```

### Pattern 4: Standalone Adapter with No-Ops

**What:** Standalone adapter implements the full PlatformAdapter interface with no-op methods for all registration functions and console logging.

**When:** Running outside OpenClaw (library mode, CLI-only).

**Example (from provider-core `src/adapters/standalone/index.ts`):**
```typescript
// Source: provider-core/src/adapters/standalone/index.ts
export function createStandaloneAdapter(workspacePath?: string): PlatformAdapter {
  const resolvedPath = workspacePath ?? process.cwd();
  return {
    platform: 'standalone',
    getWorkspacePath: () => resolvedPath,
    onBeforeToolCall: (_handler) => {},     // No-op
    onAgentBootstrap: (_handler) => {},     // No-op
    registerCliCommand: (_config) => {},    // No-op
    registerBackgroundService: (_config) => {}, // No-op
    registerSlashCommand: (_config) => {},  // No-op
    log: (level, message, data) => {
      if (data !== undefined) console[level](`[CareAgent] ${message}`, data);
      else console[level](`[CareAgent] ${message}`);
    },
  };
}
```

### Pattern 5: Hardening Layer Stubs (Allow-All)

**What:** Future defense layers are scaffolded as allow-all pass-through functions in Phase 1. They are registered in the pipeline but have no enforcement logic until their target phase.

**When:** Layers that will be implemented in later phases but need structural presence in the pipeline now.

**Example (pattern for consent-gate.ts and data-minimization.ts stubs):**
```typescript
// Pattern derived from provider-core layer structure
import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'consent-gate';

export function checkConsentGate(
  _event: ToolCallEvent,
  _cans: CANSDocument,
): HardeningLayerResult {
  return { layer: LAYER_NAME, allowed: true, reason: 'stub — consent gate not yet implemented (Phase 5)' };
}
```

### Pattern 6: Module Stub with "Not Yet Implemented" Factories

**What:** Subsystems scheduled for later phases export types and factory functions. Factory functions return objects whose methods throw "not yet implemented" errors.

**When:** protocol/, neuron/, chart/ modules that need type exports in Phase 1 but implementation in later phases.

**Example (from provider-core `src/neuron/client.ts`):**
```typescript
// Source: provider-core/src/neuron/client.ts
export function createNeuronClient(): NeuronClient {
  return {
    async register(_config) {
      throw new Error('Neuron client not yet implemented (Phase 5)');
    },
    async heartbeat() {
      throw new Error('Neuron client not yet implemented (Phase 5)');
    },
    async disconnect() {
      throw new Error('Neuron client not yet implemented (Phase 5)');
    },
  };
}
```

### Pattern 7: Vendor YAML Centralization

**What:** YAML parsing is centralized in `src/vendor/yaml/index.ts` which re-exports from the `yaml` npm package. tsdown bundles this into dist, making the published package zero-dependency.

**When:** Any module that needs YAML parsing (CANS.md frontmatter, skill manifests).

**Example (from provider-core `src/vendor/yaml/index.ts`):**
```typescript
// Source: provider-core/src/vendor/yaml/index.ts
// IMPORTANT: `yaml` is a devDependency because tsdown inlines it.
export { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
```

### Anti-Patterns to Avoid

- **Importing from provider-core:** Zero code sharing between the two packages. All shared concepts are independently implemented.
- **Importing OpenClaw types directly:** Use `api: unknown` and duck-typing. OpenClaw is an optional peer dependency.
- **Synchronous operations blocking the event loop:** Audit writes use `appendFileSync` in provider-core (acceptable for v1), but patient-core should consider async writes early given higher audit volume.
- **Partial activation states:** The activation gate is binary. Either CANS.md is valid and the system is fully active, or it is inactive. No partial states.
- **Hard-coded workspace paths:** Always resolve workspace from the adapter's `getWorkspacePath()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML parsing | Custom YAML parser | `yaml` package (bundled via tsdown) | YAML 1.2 spec is complex; edge cases around multiline strings, anchors, merge keys |
| Schema validation | Custom validation functions | TypeBox `Value.Check()` / `Value.Errors()` | TypeBox generates TypeScript types + JSON Schema from single source; consistent with provider-core and OpenClaw |
| Hash chain for audit | Custom linked list or DB | SHA-256 via `node:crypto` + JSONL append | Provider-core pattern: `createHash('sha256').update(line).digest('hex')` for each entry; prev_hash field links chain |
| CLI argument parsing | Custom arg parser | OpenClaw's `registerCli` with yargs-style `program.command()` | OpenClaw wraps yargs; standalone mode uses the same command definitions without the yargs wrapper |
| Test coverage | Manual tracking | vitest `coverage.thresholds` in vitest.config.ts | Enforce 80% lines/branches/functions/statements automatically at test time |
| Module bundling | Rollup/webpack config from scratch | tsdown `defineConfig` | tsdown handles ESM output, DTS generation, external marking, source maps, and clean builds in 16 lines of config |

**Key insight:** Phase 1 is infrastructure, not innovation. Every problem has a proven solution in provider-core. The risk is not "how to solve" but "accidentally diverging from provider-core's pattern."

## Common Pitfalls

### Pitfall 1: tsdown External Configuration Missing OpenClaw

**What goes wrong:** Build fails or bundles OpenClaw code into dist, creating a hard dependency.
**Why it happens:** tsdown bundles devDependencies that are imported. If `openclaw` is not in the `external` array, tsdown tries to resolve it.
**How to avoid:** Always include `external: ['openclaw', 'openclaw/*']` in tsdown.config.ts. Provider-core does this.
**Warning signs:** `pnpm build` fails with "Cannot resolve openclaw" or dist size is unexpectedly large.

### Pitfall 2: Package.json Exports Map Incorrect

**What goes wrong:** Consumers cannot import from `@careagent/patient-core/standalone` or `@careagent/patient-core/core`.
**Why it happens:** The `exports` map in package.json must match the exact output paths from tsdown. A mismatch means Node.js resolver cannot find the file.
**How to avoid:** Verify exports map matches dist output. Provider-core pattern:
```json
{
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./openclaw": { "import": "./dist/entry/openclaw.js", "types": "./dist/entry/openclaw.d.ts" },
    "./standalone": { "import": "./dist/entry/standalone.js", "types": "./dist/entry/standalone.d.ts" },
    "./core": { "import": "./dist/entry/core.js", "types": "./dist/entry/core.d.ts" }
  }
}
```
**Warning signs:** `ERR_PACKAGE_PATH_NOT_EXPORTED` at import time; TypeScript cannot find type declarations for sub-paths.

### Pitfall 3: Workspace Path Resolution Fallback Chain Incomplete

**What goes wrong:** Adapter returns `undefined` or empty string for workspace path, causing file operations to write to wrong location.
**Why it happens:** OpenClaw's API object shape changes between versions. The workspace path might be on `api.workspaceDir`, `api.config.workspaceDir`, or `api.context.workspaceDir`.
**How to avoid:** Implement the full fallback chain as provider-core does: `api.workspaceDir` > `api.config.workspaceDir` > `api.context.workspaceDir` > `process.cwd()`. Each level is checked with `typeof ... === 'string' && ...` guard.
**Warning signs:** Audit log appears in unexpected directory; CANS.md not found despite existing.

### Pitfall 4: Missing try/catch on API Method Calls

**What goes wrong:** Plugin crashes when OpenClaw API shape differs from expectation.
**Why it happens:** Defensive coding fatigue. Easy to forget try/catch around `raw.registerService()` or `raw.log()`.
**How to avoid:** Every method in the OpenClaw adapter must follow the pattern: check `typeof`, call in try/catch, log warning on failure, fall back to no-op. Provider-core has this on all 6 adapter methods.
**Warning signs:** Unhandled exceptions in OpenClaw's plugin loader; plugin fails to register.

### Pitfall 5: Coverage Threshold Not Set in vitest.config.ts

**What goes wrong:** Tests pass with low coverage; CI does not enforce quality bar.
**Why it happens:** Forgetting the `thresholds` block or setting wrong values.
**How to avoid:** Match provider-core's vitest.config.ts exactly:
```typescript
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: ['src/vendor/**'],
  thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
}
```
**Warning signs:** `pnpm test:coverage` passes with 30% coverage.

### Pitfall 6: Circular Module Dependencies in Entry Points

**What goes wrong:** tsdown produces broken output; runtime import errors.
**Why it happens:** Entry points (openclaw.ts, standalone.ts, core.ts) all import from the same src/ tree. If core.ts re-exports from modules that have side effects, importing core.ts triggers activation.
**How to avoid:** core.ts must only re-export types and pure functions. Never import modules with side effects (audit pipeline construction, file system access) from core.ts. Provider-core follows this strictly.
**Warning signs:** Importing `@careagent/patient-core/core` creates `.careagent/AUDIT.log` unexpectedly.

### Pitfall 7: Forgetting `"type": "module"` in package.json

**What goes wrong:** Node.js treats `.js` files as CommonJS; ESM imports fail.
**Why it happens:** `"type": "module"` is easy to omit from a fresh package.json.
**How to avoid:** Include `"type": "module"` in package.json. Provider-core has this.
**Warning signs:** `SyntaxError: Cannot use import statement in a module` at runtime.

## Code Examples

### Complete tsdown.config.ts (from provider-core)

```typescript
// Source: provider-core/tsdown.config.ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/entry/openclaw.ts',
    'src/entry/standalone.ts',
    'src/entry/core.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['openclaw', 'openclaw/*'],
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
});
```

### Complete tsconfig.json (from provider-core)

```json
// Source: provider-core/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### Complete vitest.config.ts (from provider-core)

```typescript
// Source: provider-core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/vendor/**'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
```

### Complete package.json Template (adapted from provider-core)

```json
{
  "name": "@careagent/patient-core",
  "version": "0.1.0",
  "description": "Patient-facing clinical agent with consent engine and secure channel",
  "license": "Apache-2.0",
  "type": "module",
  "openclaw": {
    "extensions": ["./dist/index.js"]
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./openclaw": {
      "import": "./dist/entry/openclaw.js",
      "types": "./dist/entry/openclaw.d.ts"
    },
    "./standalone": {
      "import": "./dist/entry/standalone.js",
      "types": "./dist/entry/standalone.d.ts"
    },
    "./core": {
      "import": "./dist/entry/core.js",
      "types": "./dist/entry/core.d.ts"
    }
  },
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
  "devDependencies": {
    "@sinclair/typebox": "~0.34.0",
    "@vitest/coverage-v8": "~4.0.0",
    "tsdown": "~0.20.0",
    "typescript": "~5.7.0",
    "vitest": "~4.0.0",
    "yaml": "^2.8.2"
  },
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  }
}
```

### Complete openclaw.plugin.json Template

```json
{
  "id": "@careagent/patient-core",
  "name": "CareAgent",
  "description": "Patient-facing clinical agent with consent engine and secure channel",
  "version": "0.1.0",
  "configSchema": {},
  "skills": [],
  "commands": [],
  "hooks": []
}
```

### PlatformAdapter Interface (patient-core extension of provider-core)

```typescript
// Patient-core extends provider-core's interface with registerHook
export interface PlatformAdapter {
  readonly platform: string;
  getWorkspacePath(): string;
  onBeforeToolCall(handler: ToolCallHandler): void;
  onAgentBootstrap(handler: BootstrapHandler): void;
  registerCliCommand(config: CliCommandConfig): void;
  registerBackgroundService(config: ServiceConfig): void;
  registerSlashCommand(config: SlashCommandConfig): void;
  log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;

  // Patient-core addition: generic hook extensibility
  registerHook(name: string, handler: (...args: unknown[]) => void): void;
}
```

### Chart Types Stub (patient-specific)

```typescript
// src/chart/types.ts
// Patient-chart vault interface contract
// patient-chart is a separate project at /Users/medomatic/Documents/Projects/patient-chart/

/** Result of a patient-chart operation. */
export interface ChartOperationResult {
  success: boolean;
  error?: string;
}

/** Interface for patient-chart vault communication. */
export interface PatientChartVault {
  /** Read a record from the encrypted vault. */
  read(recordId: string): Promise<unknown>;

  /** Write a record to the encrypted vault. */
  write(recordId: string, data: unknown): Promise<ChartOperationResult>;

  /** Check if the caller has access to a record. */
  checkAccess(recordId: string): Promise<boolean>;
}
```

### Smoke Test (adapted from provider-core)

```typescript
// test/smoke.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('@careagent/patient-core', () => {
  it('exports a register function', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.default).toBe('function');
  });

  it('register function accepts a mock API without throwing', async () => {
    const mod = await import('../src/index.js');
    const tmpDir = mkdtempSync(join(tmpdir(), 'careagent-smoke-'));
    expect(() => mod.default({ workspaceDir: tmpDir })).not.toThrow();
  });
});
```

### Integration Test Mock API (from provider-core)

```typescript
// Test helper: creates a mock OpenClaw API that records all method calls
function createMockAPI(workspacePath: string) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    workspaceDir: workspacePath,
    registerCli: (cb: Function, opts: unknown) => {
      calls.push({ method: 'registerCli', args: [opts] });
      cb({ program: { command: () => ({ description: () => ({ action: () => {} }) }) } });
    },
    registerService: (config: unknown) => {
      calls.push({ method: 'registerService', args: [config] });
    },
    registerCommand: (config: unknown) => {
      calls.push({ method: 'registerCommand', args: [config] });
    },
    on: (event: string, handler: Function) => {
      calls.push({ method: 'on', args: [event, handler] });
    },
    log: (level: string, msg: string) => {
      calls.push({ method: 'log', args: [level, msg] });
    },
    calls,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tsup for bundling | tsdown (Rolldown-powered) | 2025 | Faster builds, better tree-shaking, maintained by Rolldown team |
| CommonJS output | ESM-only | Node.js 22 era | `"type": "module"` in package.json; all imports use `.js` extension |
| Jest for testing | vitest ~4.0 | 2024-2025 | ESM-native, no transpilation step, faster watch mode |
| Zod/Ajv for schemas | TypeBox 0.34.x | Project standard | Single source for JSON Schema + TypeScript types; used by OpenClaw |
| `dependencies` for yaml | `devDependencies` + tsdown bundling | tsdown pattern | Zero runtime deps: yaml bundled into dist at build time |

**Deprecated/outdated:**
- `tsup`: Replaced by `tsdown` in this ecosystem. Do not use tsup.
- `CommonJS`: This project is ESM-only. Do not add `"require"` conditions to exports map.
- `@types/node`: Not needed with TypeScript ~5.7 and Node >=22 (types included).

## Open Questions

1. **ActivationGate identity_type discriminator**
   - What we know: Provider-core's ActivationGate does not check `identity_type` -- it validates any CANS.md it finds. Patient-core will need an `identity_type: 'patient'` discriminator in Phase 2.
   - What's unclear: Should the Phase 1 ActivationGate stub be aware of `identity_type` or is that purely a Phase 2 concern?
   - Recommendation: Phase 1 stub should return `{ active: false, document: null, reason: 'CANS schema not yet implemented (Phase 2)' }` for all inputs. The discriminator logic belongs in Phase 2 when the Patient CANS schema is defined.

2. **registerHook extensibility method scope**
   - What we know: CONTEXT.md specifies a generic `registerHook(name, handler)` method on PlatformAdapter for future patient-specific hooks (consent gate, channel transport).
   - What's unclear: Should the OpenClaw adapter forward `registerHook` to `api.on(name, handler)` or maintain an internal registry?
   - Recommendation: Internal registry pattern in the adapter. The OpenClaw adapter stores hooks in a `Map<string, Function[]>` and exposes a `triggerHook(name, ...args)` method. This avoids coupling patient-core's hook naming to OpenClaw's event system.

3. **@medplum/fhirtypes inclusion timing**
   - What we know: The STACK.md research lists `@medplum/fhirtypes` as a dev dependency. CONTEXT.md for Phase 1 does not mention it.
   - What's unclear: Whether to add it in Phase 1 or wait for the phase that needs it.
   - Recommendation: Omit from Phase 1. Add in Phase 2 or Phase 7 when health context types are actually needed. Phase 1 has no FHIR type requirements.

## Sources

### Primary (HIGH confidence)
- Provider-core source code (direct file analysis, `/Users/medomatic/Documents/Projects/provider-core/src/`): All architecture patterns, code examples, and configuration files verified by reading actual source
- Provider-core `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `openclaw.plugin.json`: Configuration templates verified as working (provider-core builds and tests pass)
- Provider-core test files (`test/unit/adapters/`, `test/integration/plugin.test.ts`, `test/smoke.test.ts`): Test patterns and mock API structure verified

### Secondary (MEDIUM confidence)
- [tsdown official documentation](https://tsdown.dev/options/dependencies) -- Dependency handling, external configuration, DTS generation
- [tsdown getting started](https://tsdown.dev/guide/getting-started) -- Entry point configuration, output format options
- [OpenClaw plugin documentation](https://docs.openclaw.ai/tools/plugin) -- Plugin manifest format, API methods, hook registration
- [tsdown npm](https://www.npmjs.com/package/tsdown) -- Version 0.20.3 (latest as of 2026-02-21)
- [vitest configuration docs](https://vitest.dev/config/) -- Coverage thresholds, globals, include patterns
- [@sinclair/typebox npm](https://www.npmjs.com/package/@sinclair/typebox) -- Version 0.34.x compatibility confirmed

### Tertiary (LOW confidence)
- None. All findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Entirely locked by provider-core mirror decision; all versions verified against npm registry
- Architecture: HIGH -- Direct copy of provider-core patterns with minor patient-specific additions (registerHook, chart types stub, hardening layer stubs)
- Pitfalls: HIGH -- All pitfalls derived from actual provider-core code analysis and documented edge cases in the adapter/entry implementations

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable foundation; 30-day validity)
