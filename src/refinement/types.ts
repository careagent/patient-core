/**
 * Refinement engine types -- observation recording, divergence detection,
 * and proposal lifecycle management.
 *
 * Mirrors provider-core's refinement types. Stub for Phase 5+.
 */

export type ObservationCategory =
  | 'preference'
  | 'consent'
  | 'health_context'
  | 'communication';

export interface Observation {
  timestamp: string;
  session_id: string;
  category: ObservationCategory;
  field_path: string;
  declared_value: unknown;
  observed_value: unknown;
  context?: string;
}

export interface DivergencePattern {
  field_path: string;
  category: ObservationCategory;
  observation_count: number;
  declared_value: unknown;
  most_common_observed: unknown;
  evidence_summary: string;
}

export interface Proposal {
  id: string;
  created_at: string;
  field_path: string;
  category: ObservationCategory;
  current_value: unknown;
  proposed_value: unknown;
  evidence_summary: string;
  observation_count: number;
  status: 'pending' | 'accepted' | 'rejected' | 'deferred';
  resolved_at?: string;
  rejection_count?: number;
}

export type ProposalResolution = 'accept' | 'reject' | 'defer';
