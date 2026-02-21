/**
 * Audit entry TypeBox schema -- defines the shape of every entry
 * in the immutable audit log.
 *
 * Mirrors provider-core's entry-schema.ts. Each entry records who did what,
 * when, and what happened, with hash chaining to detect tampering.
 */

import { Type, type Static } from '@sinclair/typebox';

// ---------------------------------------------------------------------------
// Action States -- the lifecycle of a clinical action
// ---------------------------------------------------------------------------

export const ActionState = Type.Union([
  Type.Literal('ai-proposed'),
  Type.Literal('patient-approved'),
  Type.Literal('patient-modified'),
  Type.Literal('patient-rejected'),
  Type.Literal('system-blocked'),
]);

export type ActionStateType = Static<typeof ActionState>;

// ---------------------------------------------------------------------------
// Audit Entry Schema
// ---------------------------------------------------------------------------

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
  prev_hash: Type.Union([Type.String(), Type.Null()]),
});

export type AuditEntry = Static<typeof AuditEntrySchema>;
