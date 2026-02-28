/**
 * Hardening engine types -- interfaces for the 6-layer hardening system.
 *
 * Patient-core hardening covers:
 * - Tool policy lockdown (whitelist-only permitted_actions)
 * - Execution approval gates (exec binary allowlist)
 * - CANS protocol injection into system prompt
 * - Docker sandbox detection (report-only)
 * - Consent gate (per-action consent engine with posture enforcement)
 * - Data minimization (allow-all stub -- Phase 5)
 *
 * Mirrors provider-core's 4 layers and adds 2 patient-specific layers.
 */

import type { CANSDocument } from '../activation/cans-schema.js';
import type { ToolCallEvent } from '../adapters/types.js';
import type { PlatformAdapter } from '../adapters/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';

/** Result from a single hardening layer check. */
export interface HardeningLayerResult {
  layer: string;
  allowed: boolean;
  reason?: string;
}

/** Configuration required to activate the hardening engine. */
export interface HardeningConfig {
  cans: CANSDocument;
  adapter: PlatformAdapter;
  audit: AuditPipeline;
}

/**
 * The hardening engine -- enforces all 6 hardening layers on every tool call.
 *
 * Lifecycle: activate() once with CANS config, then check() on every tool call.
 * injectProtocol() extracts clinical hard rules for system prompt injection.
 */
export interface HardeningEngine {
  /** Initialize all 6 hardening layers from CANS configuration. */
  activate(config: HardeningConfig): void;

  /** Check a tool call against all active hardening layers. */
  check(event: ToolCallEvent): HardeningLayerResult;

  /** Extract clinical hard rules from CANS for system prompt injection. */
  injectProtocol(cans: CANSDocument): string[];
}

/**
 * Signature for a single hardening layer check function.
 *
 * Every layer is a pure, stateless function: (event, cans) => LayerResult.
 * Layers are composed by the engine in a fixed order.
 */
export type HardeningLayerFn = (
  event: ToolCallEvent,
  cans: CANSDocument,
) => HardeningLayerResult;
