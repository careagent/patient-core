/**
 * Hardening engine orchestrator -- composes all 6 layers with short-circuit-on-deny.
 *
 * Patient-core extends provider-core's 4-layer engine with 2 additional
 * patient-specific layers: consent-gate and data-minimization (allow-all
 * stubs until Phase 5).
 *
 * Hardening is always on (deterministic, hardcoded in plugin) -- not
 * configurable via CANS.
 */

import type { ToolCallEvent, ToolCallResult } from '../adapters/types.js';
import type { HardeningEngine, HardeningConfig, HardeningLayerResult, HardeningLayerFn } from './types.js';
import type { CANSDocument } from '../activation/cans-schema.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import { checkToolPolicy } from './layers/tool-policy.js';
import { checkExecAllowlist } from './layers/exec-allowlist.js';
import { checkCansInjection, injectProtocol, extractProtocolRules } from './layers/cans-injection.js';
import { checkDockerSandbox } from './layers/docker-sandbox.js';
import { checkConsentGate } from './layers/consent-gate.js';
import { checkDataMinimization } from './layers/data-minimization.js';
import { setupCanary } from './canary.js';

/** Ordered layer pipeline: evaluated in sequence, short-circuits on first deny. */
const LAYERS: HardeningLayerFn[] = [
  checkToolPolicy,
  checkExecAllowlist,
  checkCansInjection,
  checkDockerSandbox,
  checkConsentGate,
  checkDataMinimization,
];

/** Create a hardening engine instance. */
export function createHardeningEngine(): HardeningEngine {
  let activated = false;
  let cans: CANSDocument;
  let audit: AuditPipeline;

  function check(event: ToolCallEvent): HardeningLayerResult {
    if (!activated) {
      throw new Error('Engine not activated');
    }

    let traceId: string | undefined;
    try {
      traceId = audit.createTraceId();
    } catch {
      // Audit pipeline may be a stub -- continue without trace ID
    }

    let finalResult: HardeningLayerResult = { layer: 'engine', allowed: true };

    for (const layer of LAYERS) {
      const result = layer(event, cans);

      if (!result.allowed) {
        // Denied -- audit log with blocking info and short-circuit
        try {
          audit.log({
            action: 'hardening_check',
            target: event.toolName,
            outcome: 'denied',
            details: { layer: result.layer, reason: result.reason },
            blocking_layer: result.layer,
            blocked_reason: result.reason,
            trace_id: traceId,
          });
        } catch {
          // Audit pipeline may be a stub -- swallow errors
        }
        return result;
      }

      // Allowed -- audit log this layer's pass
      try {
        audit.log({
          action: 'hardening_check',
          target: event.toolName,
          outcome: 'allowed',
          details: { layer: result.layer, reason: result.reason },
          trace_id: traceId,
        });
      } catch {
        // Audit pipeline may be a stub -- swallow errors
      }

      finalResult = result;
    }

    return finalResult;
  }

  return {
    activate(config: HardeningConfig): void {
      cans = config.cans;
      audit = config.audit;
      activated = true;

      // Set up canary for hook liveness detection
      const canary = setupCanary(config.adapter, audit);

      // Register before_tool_call handler
      try {
        config.adapter.onBeforeToolCall((event: ToolCallEvent): ToolCallResult => {
          canary.markVerified();
          const result = check(event);
          if (!result.allowed) {
            return { block: true, blockReason: result.reason };
          }
          return { block: false };
        });
      } catch {
        // Adapter may not support onBeforeToolCall -- graceful degradation
        config.adapter.log('warn', '[CareAgent] Failed to register before_tool_call handler for hardening');
      }

      // Register bootstrap handler for CANS protocol injection
      try {
        config.adapter.onAgentBootstrap((context) => {
          injectProtocol(context, cans);
        });
      } catch {
        // Adapter may not support onAgentBootstrap -- graceful degradation
        config.adapter.log('warn', '[CareAgent] Failed to register bootstrap handler for protocol injection');
      }
    },

    check,

    injectProtocol(doc: CANSDocument): string[] {
      return extractProtocolRules(doc).split('\n');
    },
  };
}
