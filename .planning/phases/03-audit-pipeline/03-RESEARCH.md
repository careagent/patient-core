# Phase 3: Audit Pipeline - Research

**Researched:** 2026-02-21
**Domain:** Hash-chained append-only JSONL audit logging with async buffered writes, integrity verification, and bilateral correlation
**Confidence:** HIGH

## Summary

Phase 3 implements the patient-owned audit pipeline: a hash-chained JSONL append-only log at `.careagent/AUDIT.log` with async-buffered writes that never block the calling workflow. The domain is well-understood -- provider-core has a fully working synchronous implementation that patient-core's stubs explicitly mirror. Patient-core diverges from provider-core in one critical area: **writes must be async-buffered** (AUDT-04), because the patient side generates more audit events per action (consent check, data minimization, provider verification, channel events) and the PRD mandates audit never blocks workflow.

The existing codebase has four stub files (`entry-schema.ts`, `writer.ts`, `pipeline.ts`, `integrity-service.ts`) with well-defined APIs that already serve as the contract for 15+ call sites across entry points, hardening engine, canary, and CLI modules. All call sites wrap `audit.log()` in try/catch to swallow the stub's `throw new Error()`. The implementation replaces these stubs with working code while preserving the existing API surface exactly.

**Primary recommendation:** Implement the async-buffered writer as an in-memory queue that flushes to disk via `node:fs/promises appendFile`. Use the provider-core writer as the structural reference for hash-chaining and verification, but replace `appendFileSync` with a batched async flush. Add a `correlation_id` field to the entry schema for bilateral audit support. Keep the integrity service as a timer-based background service matching provider-core's pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single append-only AUDIT.log file, no rotation for v1
- Crash with unflushed buffer entries is acceptable -- losing the last few buffered entries on crash is OK; no write-ahead log needed
- On chain break: report the break point and continue appending new entries -- do NOT quarantine or restart the chain. Historical damage doesn't stop future logging

### Claude's Discretion
- Entry metadata granularity, schema shape (unified vs separate), and human-readable summary field: Claude's discretion based on downstream phase needs (Phase 4 status command, Phase 6 channel logging, Phase 7 skill logging)
- Flush trigger strategy (timer, count, or hybrid): Claude's discretion
- Write failure handling (silent degrade vs warning): Claude's discretion
- Force-flush API (`flush()` for callers needing persistence guarantees): Claude's discretion based on what consent/channel phases actually need
- Verification timing (startup, on-demand, or hybrid): Claude's discretion
- Verification output format (structured report vs pass/fail): Claude's discretion based on Phase 4 status needs
- Genesis entry anchoring (null prev_hash vs deterministic seed): Claude's discretion
- Correlation ID generation (initiator vs patient-always): Claude's discretion
- Entry count per interaction (two entries vs combined): Claude's discretion based on audit trail clarity
- Bilateral entry format ownership (patient-core defines vs shared spec): Claude's discretion based on provider-core alignment
- Correlation ID format (opaque UUID vs content-derived): Claude's discretion

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUDT-01 | Hash-chained JSONL append-only audit log in `.careagent/AUDIT.log` | Provider-core's AuditWriter is the direct reference. SHA-256 hash of each JSON line stored as `prev_hash` in the next entry. Genesis entry uses `prev_hash: null`. Verified pattern from AuditableLLM research. |
| AUDT-02 | Every patient action (share, request, review, consent) logged with full context | Entry schema already has `action`, `action_state`, `actor`, `target`, `outcome`, `details` fields. Add `correlation_id` for bilateral support and optional `summary` for human readability (Phase 4 status command). |
| AUDT-03 | Every channel message (inbound and outbound) logged with bilateral audit entries | Bilateral correlation via `correlation_id` field (UUIDv4). Each side logs independently with the same correlation_id embedded in the ChannelMessage `audit_ref`. Two separate entries per interaction (one per side) for audit trail clarity. |
| AUDT-04 | Async buffered writes -- audit never blocks patient workflow | In-memory buffer queue with async flush via `node:fs/promises appendFile`. Hybrid flush trigger: count threshold (e.g., 10 entries) OR timer (e.g., 1 second), whichever fires first. Provider-core uses sync `appendFileSync` -- patient-core diverges here deliberately. |
| AUDT-05 | Background integrity verification service validates hash chain | Timer-based background service matching provider-core's `createAuditIntegrityService` pattern. Startup check + periodic interval (60s). On chain break: log the break point, continue appending. |
| AUDT-06 | Patient owns and controls the audit log; entries log references, not raw health data content | Entry `details` field stores references (IDs, categories, counts) never raw health data. `target` field is a provider NPI or action reference, not patient data. Enforced by convention and documented in schema JSDoc. |
| DFNS-04 | Audit trail provides complete, verifiable interaction history with chain integrity verification | Covered by AUDT-01 (hash chain) + AUDT-05 (verification). The `verifyChain()` method returns structured results with `brokenAt` index for break point reporting. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | Node 22+ built-in | SHA-256 hashing, `randomUUID()` for session/trace/correlation IDs | Zero-dependency requirement (PLUG-04). Provider-core uses same. |
| `node:fs/promises` | Node 22+ built-in | Async `appendFile` for buffered writes, `readFile` for verification | Async alternative to provider-core's `appendFileSync`. |
| `node:fs` | Node 22+ built-in | `existsSync`, `mkdirSync` for directory setup, `readFileSync` for chain recovery at startup | Sync operations only during construction (startup). |
| `@sinclair/typebox` | ~0.34.0 | TypeBox schema for `AuditEntrySchema` (already in use) | Already a devDependency. Entry schema defined in Phase 1. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ~4.0.0 | Unit and integration tests | Already configured. Test audit writer, pipeline, integrity service. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory buffer + appendFile | Writable stream (`fs.createWriteStream`) | Streams add complexity around backpressure, error handling, and lifecycle management. For an append-only single-file log, batched `appendFile` is simpler and sufficient. Stream would be warranted if write volume were much higher. |
| Timer-based flush | `setImmediate` microtask flush | `setImmediate` flushes too eagerly (every event loop tick), losing the batching benefit. Timer gives meaningful batching windows. |
| Periodic integrity check | File system watcher (`fs.watch`) | Watcher triggers on every write (including our own), creating noise. Periodic check is simpler and matches provider-core's proven pattern. |

**Installation:**
```bash
# No new dependencies needed. All tools are Node.js built-ins or existing devDependencies.
```

## Architecture Patterns

### Recommended Project Structure
```
src/audit/
├── entry-schema.ts      # AuditEntry TypeBox schema (EXISTS - extend with correlation_id)
├── writer.ts            # AuditWriter: hash-chain logic + async buffered flush (EXISTS - implement)
├── pipeline.ts          # AuditPipeline: high-level API, session/trace management (EXISTS - implement)
└── integrity-service.ts # Background verification service (EXISTS - implement)
```

No new files needed. All four modules exist as stubs from Phase 1. The implementation replaces stub bodies while preserving the exported API surface.

### Pattern 1: Async Buffered Writer with In-Memory Hash Chain
**What:** Buffer audit entries in memory, maintain the hash chain in memory, flush batches to disk asynchronously. The hash chain is always consistent because it is computed in memory before any disk I/O.
**When to use:** Every audit write operation.
**Why:** Provider-core uses synchronous `appendFileSync` which blocks the event loop. Patient-core needs async writes per AUDT-04. The in-memory chain ensures hash integrity even though disk writes are deferred.

```typescript
// Conceptual pattern -- patient-core async buffered writer
class AuditWriter {
  private lastHash: string | null = null;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing: boolean = false;
  private readonly logPath: string;

  private static readonly FLUSH_INTERVAL_MS = 1000;
  private static readonly FLUSH_THRESHOLD = 10;

  constructor(logPath: string) {
    this.logPath = logPath;
    this.lastHash = this.recoverLastHash(); // sync at startup only
  }

  append(entry: Omit<AuditEntry, 'prev_hash'>): void {
    const enriched: AuditEntry = { ...entry, prev_hash: this.lastHash };
    const line = JSON.stringify(enriched);
    this.lastHash = createHash('sha256').update(line).digest('hex');
    this.buffer.push(line);

    if (this.buffer.length >= AuditWriter.FLUSH_THRESHOLD) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    this.cancelScheduledFlush();

    const batch = this.buffer.splice(0); // take all pending
    const data = batch.join('\n') + '\n';

    try {
      await appendFile(this.logPath, data, { flag: 'a' });
    } catch {
      // Write failure: log warning, entries are lost (acceptable per user decision)
      // Caller can detect via adapter.log('warn', ...)
    }
    this.flushing = false;

    // If more entries arrived during flush, schedule another
    if (this.buffer.length > 0) {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, AuditWriter.FLUSH_INTERVAL_MS);
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      (this.flushTimer as NodeJS.Timeout).unref(); // Don't keep process alive
    }
  }
}
```

**Key differences from provider-core:**
1. `append()` is still synchronous (non-blocking to callers) but queues to buffer instead of writing to disk
2. `flush()` is async and writes batch via `appendFile` (not `appendFileSync`)
3. Hash chain computed in memory (always consistent), disk write is eventual
4. Timer is `unref()`'d so it does not prevent Node.js process exit

### Pattern 2: Provider-Core Mirrored Pipeline API
**What:** The AuditPipeline wraps AuditWriter with session management, trace IDs, and convenience methods. The API surface matches the existing stub exactly.
**When to use:** All callers use AuditPipeline, never AuditWriter directly.
**Why:** 15+ call sites already depend on the pipeline stub's API. Provider-core's pipeline is the proven reference.

```typescript
// Provider-core's pattern (direct reference)
class AuditPipeline {
  private writer: AuditWriter;
  private sessionId: string;

  constructor(workspacePath: string, sessionId?: string) {
    const auditDir = join(workspacePath, '.careagent');
    mkdirSync(auditDir, { recursive: true });
    const logPath = join(auditDir, 'AUDIT.log');
    this.writer = new AuditWriter(logPath);
    this.sessionId = sessionId || randomUUID();
  }

  log(input: AuditLogInput): void {
    this.writer.append({
      schema_version: '1',
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      trace_id: input.trace_id || randomUUID(),
      action: input.action,
      actor: input.actor || 'system',
      outcome: input.outcome,
      // ... optional fields spread conditionally
    });
  }

  async flush(): Promise<void> { return this.writer.flush(); }
  verifyChain(): VerifyResult { return this.writer.verifyChain(); }
  getSessionId(): string { return this.sessionId; }
  createTraceId(): string { return randomUUID(); }
}
```

**Patient-core additions beyond provider-core:**
1. `flush()` method exposed on pipeline (async, returns Promise) -- needed by tests and future consent/channel phases that need persistence guarantees
2. `correlation_id` support in `AuditLogInput` for bilateral audit (AUDT-03)

### Pattern 3: Bilateral Audit Correlation
**What:** Each cross-system interaction (patient <-> provider) gets a shared `correlation_id` (UUIDv4). Both sides log independent entries with the same correlation ID embedded in the ChannelMessage `audit_ref` envelope. Each side's entry references its own `prev_hash` chain independently.
**When to use:** Phase 6 (Channel) and Phase 7 (Skills) will use this. Phase 3 defines the schema field and generation API.
**Why:** The ARCHITECTURE.md bilateral audit flow diagram shows each side maintains independent hash chains with `bilateral_audit_ref` for cross-log correlation. Correlation IDs are the standard distributed tracing mechanism for linking events across independent systems.

```typescript
// Schema addition for bilateral support
correlation_id: Type.Optional(Type.String()),  // UUIDv4 shared across patient/provider

// Pipeline convenience method
createCorrelationId(): string {
  return randomUUID();
}
```

**Design decision: Two entries per interaction, not one combined.**
Rationale: Each side owns its audit trail independently. A combined entry would require both sides to agree on format and content, creating coupling. Two entries (one per side, same correlation_id) enables independent verification while supporting cross-system correlation.

### Pattern 4: Background Integrity Service
**What:** Timer-based background service that verifies the hash chain periodically. Matches provider-core's `createAuditIntegrityService` exactly.
**When to use:** Registered as a background service via `adapter.registerBackgroundService()`.
**Why:** Provider-core's pattern is proven. Startup check catches corruption from previous session; periodic checks detect runtime tampering.

```typescript
// Direct mirror of provider-core's integrity service
function createAuditIntegrityService(
  audit: AuditPipeline,
  adapter: AdapterLog,
): ServiceConfig {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  return {
    id: 'careagent-audit-integrity',
    start: () => {
      // Initial startup check
      const result = audit.verifyChain();
      if (!result.valid) {
        adapter.log('error', `Audit chain break at entry ${result.brokenAt}: ${result.error}`);
        // Continue appending -- do NOT quarantine (per user decision)
      }
      // Periodic check every 60s
      intervalId = setInterval(() => { /* same check */ }, 60_000);
    },
    stop: () => { if (intervalId) clearInterval(intervalId); },
  };
}
```

### Anti-Patterns to Avoid

- **Synchronous disk writes in append():** Provider-core uses `appendFileSync`. Patient-core MUST NOT do this per AUDT-04. The append method must be non-blocking.
- **Restarting the hash chain on corruption:** User explicitly decided: on chain break, report and continue. Do NOT create a new genesis entry or quarantine the log.
- **Logging raw health data in details field:** AUDT-06 requires references only. Never store condition names, medication lists, or any PHI in audit entries. Store IDs, counts, and category labels.
- **Write-ahead log for crash safety:** User explicitly decided crash data loss is acceptable. No WAL, no journaling, no fsync guarantees.
- **Blocking on flush() in the hot path:** `flush()` should only be called explicitly when persistence is needed (e.g., before process exit in tests). Normal operation relies on the timer/threshold trigger.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom UUID implementation | `node:crypto randomUUID()` | Built-in, RFC 4122 compliant, cryptographically random |
| SHA-256 hashing | Custom hash function | `node:crypto createHash('sha256')` | Built-in, hardware-accelerated on modern CPUs |
| Async file append | Custom write stream manager | `node:fs/promises appendFile` | Built-in, handles file descriptor management automatically |
| Directory creation | Manual existence check + mkdir | `mkdirSync(path, { recursive: true })` | Built-in, idempotent, handles nested paths |
| JSON serialization | Custom serializer | `JSON.stringify()` | Built-in, deterministic for flat objects, sufficient for JSONL |

**Key insight:** The entire audit pipeline can be built with Node.js built-ins only. Zero external dependencies. This aligns perfectly with PLUG-04 (zero runtime npm dependencies).

## Common Pitfalls

### Pitfall 1: Hash Chain Breaks After Process Crash
**What goes wrong:** If the process crashes with entries in the buffer, the in-memory `lastHash` is lost. On restart, `recoverLastHash()` reads the last line from disk (which may be behind the in-memory chain), and the chain continues correctly from the last flushed entry.
**Why it happens:** Async buffering means disk state lags memory state.
**How to avoid:** `recoverLastHash()` reads the last line from the existing log file and computes its hash. This is the correct continuation point. The lost buffered entries are simply gone (acceptable per user decision). No special handling needed.
**Warning signs:** Gap in timestamps between last entry before crash and first entry after restart.

### Pitfall 2: Non-Deterministic JSON Serialization Breaking Hash Chain
**What goes wrong:** `JSON.stringify()` with object spread can produce different key orderings if properties are added in different orders, which would produce different hashes for semantically identical entries.
**Why it happens:** JavaScript object property ordering follows insertion order for string keys, and spread operators preserve source ordering. If the entry construction changes property order between versions, hashes become incompatible.
**How to avoid:** Always construct entries with explicit property ordering in the `append()` method, not via object spread. Use a fixed field order: `schema_version`, `timestamp`, `session_id`, `trace_id`, `action`, `action_state`, `actor`, `target`, `outcome`, `details`, `blocked_reason`, `blocking_layer`, `correlation_id`, `prev_hash`. Provider-core uses the same approach (spread from input, but `prev_hash` always last).
**Warning signs:** Chain verification fails on entries written by different code paths.

### Pitfall 3: Timer Keeping Node.js Process Alive
**What goes wrong:** The flush timer and integrity service interval prevent Node.js from exiting when the main work is done.
**Why it happens:** Active timers keep the event loop alive.
**How to avoid:** Always `.unref()` the flush timer. The integrity service timer is managed by `start()`/`stop()` lifecycle. Provider-core's canary already demonstrates this pattern.
**Warning signs:** Tests hang after completion. Node.js process does not exit.

### Pitfall 4: Concurrent Flush Corruption
**What goes wrong:** If `flush()` is called while a previous flush is in progress, both could read from the same buffer and write duplicate entries.
**Why it happens:** Async `appendFile` takes time; multiple flushes could overlap.
**How to avoid:** Use a `flushing` boolean guard. If `flush()` is called while already flushing, return immediately. After the current flush completes, check if new entries arrived and schedule another flush if needed.
**Warning signs:** Duplicate entries in the audit log. Hash chain breaks from duplicate writes.

### Pitfall 5: Entry Points Removing Try/Catch After Implementation
**What goes wrong:** All 15+ call sites currently wrap `audit.log()` in try/catch because the stub throws. When the implementation replaces the stub, the try/catch should remain -- write failures from disk I/O errors should still be swallowed.
**Why it happens:** Developers see working audit and assume it cannot fail.
**How to avoid:** Keep all existing try/catch wrappers. The async buffer's `append()` method itself should never throw (it only queues to memory), but future callers of `flush()` may need error handling.
**Warning signs:** Unhandled promise rejections from write failures crashing the host platform.

### Pitfall 6: Verification Reading File While Flush In Progress
**What goes wrong:** `verifyChain()` reads the log file synchronously. If a flush is writing simultaneously, the file may contain a partial write (truncated last line), causing verification to report a false chain break.
**Why it happens:** Concurrent read and async write without coordination.
**How to avoid:** `verifyChain()` should flush pending entries first (await flush), then read the file. Alternatively, accept that in-flight verification may see stale state and document this behavior.
**Warning signs:** Intermittent verification failures that resolve on retry.

## Code Examples

### Example 1: Provider-Core Writer (Direct Reference)
```typescript
// Source: /Users/medomatic/Documents/Projects/provider-core/src/audit/writer.ts
// This is the ACTUAL provider-core implementation that patient-core mirrors.
// Key difference: patient-core replaces appendFileSync with async buffer.

export class AuditWriter {
  private lastHash: string | null = null;
  private readonly logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
    this.lastHash = this.recoverLastHash();
  }

  append(entry: Omit<AuditEntry, 'prev_hash'>): void {
    const enriched: AuditEntry = { ...entry, prev_hash: this.lastHash };
    const line = JSON.stringify(enriched);
    const currentHash = createHash('sha256').update(line).digest('hex');
    appendFileSync(this.logPath, line + '\n', { flag: 'a' });
    this.lastHash = currentHash;
  }

  verifyChain(): { valid: boolean; entries: number; brokenAt?: number; error?: string } {
    // Read all lines, walk chain, verify each prev_hash matches SHA-256 of previous line
    // Returns { valid: true, entries: N } or { valid: false, brokenAt: M, error: '...' }
  }

  private recoverLastHash(): string | null {
    // Read last line of existing log, compute its SHA-256
    // Returns null if file doesn't exist or is empty
  }
}
```

### Example 2: Provider-Core Pipeline (Direct Reference)
```typescript
// Source: /Users/medomatic/Documents/Projects/provider-core/src/audit/pipeline.ts
// Patient-core's pipeline API matches this exactly.

export class AuditPipeline {
  private writer: AuditWriter;
  private sessionId: string;

  constructor(workspacePath: string, sessionId?: string) {
    const auditDir = join(workspacePath, '.careagent');
    mkdirSync(auditDir, { recursive: true });
    this.writer = new AuditWriter(join(auditDir, 'AUDIT.log'));
    this.sessionId = sessionId || randomUUID();
  }

  log(input: AuditLogInput): void {
    const entry: Omit<AuditEntry, 'prev_hash'> = {
      schema_version: '1',
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      trace_id: input.trace_id || randomUUID(),
      action: input.action,
      actor: input.actor || 'system',
      outcome: input.outcome,
      ...(input.target !== undefined && { target: input.target }),
      ...(input.action_state !== undefined && { action_state: input.action_state }),
      ...(input.details !== undefined && { details: input.details }),
      ...(input.blocked_reason !== undefined && { blocked_reason: input.blocked_reason }),
      ...(input.blocking_layer !== undefined && { blocking_layer: input.blocking_layer }),
    };
    this.writer.append(entry);
  }

  logBlocked(input: { ... }): void { this.log({ ...input, outcome: 'denied', actor: 'system' }); }
  verifyChain(): VerifyResult { return this.writer.verifyChain(); }
  getSessionId(): string { return this.sessionId; }
  createTraceId(): string { return randomUUID(); }
}
```

### Example 3: Provider-Core Integrity Service (Direct Reference)
```typescript
// Source: /Users/medomatic/Documents/Projects/provider-core/src/audit/integrity-service.ts
// Patient-core mirrors this pattern exactly.

export function createAuditIntegrityService(
  audit: AuditPipeline,
  adapter: AdapterLog,
): ServiceConfig {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  return {
    id: 'careagent-audit-integrity',
    start: () => {
      const initialResult = audit.verifyChain();
      if (!initialResult.valid) {
        adapter.log('error', `Audit chain integrity failure: ${initialResult.error}`);
      }
      intervalId = setInterval(() => {
        const result = audit.verifyChain();
        if (!result.valid) {
          adapter.log('error', `Audit chain integrity failure: ${result.error}`);
        }
      }, 60_000);
    },
    stop: () => { if (intervalId) clearInterval(intervalId); },
  };
}
```

### Example 4: Entry Schema Extension for Patient-Core
```typescript
// Patient-core extends the existing schema with correlation_id for bilateral audit.
// The existing schema fields remain unchanged for backward compatibility.

export const AuditEntrySchema = Type.Object({
  schema_version: Type.Literal('1'),
  timestamp: Type.String(),
  session_id: Type.String(),
  trace_id: Type.String(),
  action: Type.String(),
  action_state: Type.Optional(ActionState),
  actor: Type.Union([
    Type.Literal('agent'),
    Type.Literal('patient'),
    Type.Literal('system'),
  ]),
  target: Type.Optional(Type.String()),
  outcome: Type.Union([
    Type.Literal('allowed'),
    Type.Literal('denied'),
    Type.Literal('escalated'),
    Type.Literal('error'),
    Type.Literal('active'),
    Type.Literal('inactive'),
  ]),
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  blocked_reason: Type.Optional(Type.String()),
  blocking_layer: Type.Optional(Type.String()),
  correlation_id: Type.Optional(Type.String()),  // NEW: bilateral audit correlation
  prev_hash: Type.Union([Type.String(), Type.Null()]),
});
```

## Discretion Recommendations

Based on research and downstream phase analysis, here are recommendations for areas marked as Claude's discretion:

### Entry Schema Shape: Unified
**Recommendation:** Single unified schema (existing `AuditEntrySchema`) extended with `correlation_id`. No separate schemas per action type.
**Rationale:** All 15+ call sites use the same `audit.log()` API. Separate schemas would require discriminated union handling at every call site. Provider-core uses a single schema successfully. Phase 4 status command, Phase 6 channel logging, and Phase 7 skill logging all benefit from a uniform entry shape they can filter by `action` field.

### Flush Trigger: Hybrid (Count + Timer)
**Recommendation:** Flush when buffer reaches 10 entries OR every 1 second, whichever comes first.
**Rationale:** Count threshold handles bursts (e.g., hardening engine checking all 6 layers generates 6 entries rapidly). Timer handles low-activity periods (e.g., idle patient session with occasional actions). 1 second is long enough for meaningful batching but short enough that data loss on crash is minimal.

### Write Failure Handling: Silent Degrade with Adapter Warning
**Recommendation:** On write failure, log a warning via `adapter.log('warn', ...)` if adapter is available, but never throw. Lost entries are acceptable (same as crash data loss decision).
**Rationale:** The audit pipeline must never block or crash the host workflow. Provider-core's audit is similarly non-critical-path. The adapter warning surfaces the issue to platform logging without disrupting the patient's interaction.

### Force-Flush API: Yes, Expose `flush(): Promise<void>`
**Recommendation:** Expose `flush()` on both AuditWriter and AuditPipeline.
**Rationale:** Tests need `await audit.flush()` to assert on log file contents. Phase 6 channel manager may need `await audit.flush()` before embedding `sender_audit_hash` in the ChannelMessage `audit_ref` field (the hash must reference an entry that is persisted, not just buffered). Process shutdown handlers need flush.

### Verification Timing: Startup + On-Demand (via Service)
**Recommendation:** Integrity service runs startup check. Periodic checks every 60 seconds. Pipeline exposes `verifyChain()` for on-demand use (Phase 4 status command).
**Rationale:** Matches provider-core exactly. Startup check catches corruption from previous session. Periodic check detects runtime tampering. On-demand enables `careagent status` to report chain health.

### Verification Output: Structured Report
**Recommendation:** `{ valid: boolean; entries: number; brokenAt?: number; error?: string }` (same as provider-core).
**Rationale:** Phase 4 status command needs entry count and chain health. Break point index enables targeted investigation. This is the exact shape already defined in the writer stub.

### Genesis Entry: `prev_hash: null`
**Recommendation:** First entry in a new chain uses `prev_hash: null`.
**Rationale:** Provider-core uses `null` for genesis. Simpler than a deterministic seed. Null clearly signals "chain start." The TypeBox schema already accepts `Type.Union([Type.String(), Type.Null()])`.

### Correlation ID Generation: Initiator Creates
**Recommendation:** The side that initiates the interaction (patient for outbound, provider for inbound) generates the correlation_id as a UUIDv4. The correlation_id is embedded in the ChannelMessage envelope's `audit_ref` field for the other side to extract and log.
**Rationale:** This matches the standard distributed tracing pattern where the initiator creates the trace/correlation ID. Avoids coordination overhead. Both sides log independent entries with the same ID.

### Correlation ID Format: Opaque UUIDv4
**Recommendation:** Use `randomUUID()` (opaque UUIDv4).
**Rationale:** Content-derived IDs risk leaking information about the interaction content. UUIDs are the standard correlation mechanism. `randomUUID()` is already used for session_id and trace_id in this codebase.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sync appendFileSync for audit | Async buffered writes with in-memory chain | Ongoing best practice | Non-blocking audit for high-event-volume systems |
| Merkle trees for tamper detection | Simple hash chains for append-only logs | Both are current | Hash chains are simpler for append-only; Merkle trees add value for partial verification (deferred to v2 per PROD-01) |
| Database-backed audit logs | File-based JSONL | Both are current | JSONL is zero-dependency, patient-portable, inspectable. DB would violate PLUG-04 |

**Deprecated/outdated:**
- `crypto.createCipher()` / `crypto.createDecipher()`: Deprecated since Node 10. Not relevant here (we use `createHash` only), but worth noting to avoid confusion.

## Open Questions

1. **Flush before `verifyChain()` in integrity service?**
   - What we know: If the integrity service calls `verifyChain()` while entries are buffered but not flushed, the verification checks disk state which is behind memory state. This is correct behavior (disk chain is always valid), but the entry count will be lower than the actual count.
   - What's unclear: Should the integrity service `await flush()` before verification to get an accurate count? This adds complexity to the service (async start).
   - Recommendation: Do NOT flush before verify. The integrity service checks chain validity, not completeness. A valid-but-incomplete chain (due to buffered entries) is fine. Keep the service simple.

2. **Entry schema `actor` field: should `'provider'` be added?**
   - What we know: Patient-core's stub has `actor: 'agent' | 'patient' | 'system'`. Provider-core has `actor: 'agent' | 'provider' | 'system'`. For bilateral audit, inbound messages from providers would logically have `actor: 'provider'` in the patient's log.
   - What's unclear: Whether Phase 6 channel inbound logging needs `actor: 'provider'` or uses `actor: 'system'` with provider details in `details` field.
   - Recommendation: Add `'provider'` to the actor union now. It costs nothing and avoids a schema migration when Phase 6 needs it. This aligns the field with provider-core's schema for bilateral audit symmetry.

## Sources

### Primary (HIGH confidence)
- Provider-core audit implementation: `/Users/medomatic/Documents/Projects/provider-core/src/audit/writer.ts`, `pipeline.ts`, `integrity-service.ts`, `entry-schema.ts` -- Direct source code analysis of working implementation that patient-core mirrors
- Patient-core stub files: `/Users/medomatic/Documents/Projects/patient-core/src/audit/` -- Four stubs with defined API contracts
- Patient-core ARCHITECTURE.md: `/Users/medomatic/Documents/Projects/patient-core/.planning/research/ARCHITECTURE.md` -- Bilateral audit flow diagram and entry schema design
- Node.js `node:crypto` docs: [createHash](https://nodejs.org/api/crypto.html), [randomUUID](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) -- Built-in APIs for SHA-256 and UUID
- Node.js `node:fs/promises` docs: [appendFile](https://nodejs.org/api/fs.html#fspromisesappendfilepath-data-options) -- Async file append API

### Secondary (MEDIUM confidence)
- [AuditableLLM: Hash-Chain-Backed Framework](https://www.mdpi.com/2079-9292/15/1/56) -- Academic validation of JSONL hash-chain audit pattern with negligible runtime overhead (3.4ms/step)
- [Cossack Labs: Audit Log Security](https://www.cossacklabs.com/blog/audit-logs-security/) -- Industry practices for tamper-evident audit logs
- [Microsoft: Correlation IDs](https://microsoft.github.io/code-with-engineering-playbook/observability/correlation-id/) -- Standard pattern for cross-system event correlation

### Tertiary (LOW confidence)
- None -- all findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All tools are Node.js built-ins already used in the codebase. Zero new dependencies.
- Architecture: HIGH -- Provider-core's working implementation is the direct reference. Four stub files with defined APIs constrain the implementation shape.
- Async buffering: HIGH -- Standard Node.js async I/O pattern. Timer + threshold hybrid is well-established.
- Bilateral correlation: MEDIUM -- Schema field and generation API are straightforward. Actual bilateral flow integration happens in Phase 6, not Phase 3. Phase 3 only defines the schema extension and correlation ID generation.
- Pitfalls: HIGH -- Identified from direct analysis of provider-core's sync implementation and the differences required for async buffering.

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days -- stable domain, no fast-moving dependencies)
