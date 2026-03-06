/**
 * Questionnaire TypeBox schemas — self-contained copy of the subset needed
 * from Axon's questionnaire schemas. Patient-core runs its own local form
 * engine and does not depend on Axon for patient onboarding (PHI never
 * transits through Axon).
 *
 * Supports: show_when, hard_stop, validation, cans_field, classification, mode.
 * Does NOT need: npi_lookup, npi_prefill, repeat_for, action_assignments.
 */

import { Type, type Static } from '@sinclair/typebox';

// --- Answer Type ---
export const AnswerTypeSchema = Type.Union([
  Type.Literal('boolean'),
  Type.Literal('single_select'),
  Type.Literal('multi_select'),
  Type.Literal('text'),
  Type.Literal('number'),
  Type.Literal('date'),
]);

// --- Classification (domain x sensitivity) ---
export const ClassificationSchema = Type.Object({
  domain: Type.Union([Type.Literal('clinical'), Type.Literal('administrative')]),
  sensitivity: Type.Union([Type.Literal('sensitive'), Type.Literal('non_sensitive')]),
});

// --- Question Option (for single_select / multi_select) ---
export const QuestionOptionSchema = Type.Object({
  value: Type.String(),
  label: Type.String(),
  description: Type.Optional(Type.String()),
});

// --- Question Condition (show_when) ---
export const QuestionConditionSchema = Type.Object({
  question_id: Type.String(),
  equals: Type.Optional(Type.String()),
  operator: Type.Optional(Type.Union([
    Type.Literal('equals'),
    Type.Literal('not_equals'),
    Type.Literal('contains'),
    Type.Literal('greater_than'),
    Type.Literal('less_than'),
  ])),
  value: Type.Optional(Type.String()),
});

// --- Validation constraints for text questions ---
export const TextValidationSchema = Type.Object({
  pattern: Type.Optional(Type.String()),
  min_length: Type.Optional(Type.Number()),
  max_length: Type.Optional(Type.Number()),
});

// --- Hard-stop rule ---
export const HardStopSchema = Type.Object({
  operator: Type.Union([
    Type.Literal('equals'),
    Type.Literal('not_equals'),
  ]),
  value: Type.Optional(Type.String()),
  message: Type.String(),
});

// --- Section ---
export const SectionSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.Optional(Type.String()),
  question_ids: Type.Array(Type.String()),
});

// --- Question ---
export const QuestionSchema = Type.Object({
  id: Type.String(),
  text: Type.String(),
  answer_type: AnswerTypeSchema,
  required: Type.Boolean(),
  options: Type.Optional(Type.Array(QuestionOptionSchema)),
  show_when: Type.Optional(QuestionConditionSchema),
  cans_field: Type.Optional(Type.String()),
  validation: Type.Optional(TextValidationSchema),
  llm_guidance: Type.Optional(Type.String()),
  classification: Type.Optional(ClassificationSchema),
  mode: Type.Optional(Type.Union([Type.Literal('structured'), Type.Literal('guided')])),
  hard_stop: Type.Optional(HardStopSchema),
});

// --- Questionnaire (root) ---
export const QuestionnaireSchema = Type.Object({
  id: Type.Optional(Type.String()),
  provider_type: Type.String(),
  version: Type.String(),
  taxonomy_version: Type.String(),
  display_name: Type.String(),
  description: Type.String(),
  questions: Type.Array(QuestionSchema),
  authority: Type.Optional(Type.String()),
  target_type: Type.Optional(Type.String()),
  classification: Type.Optional(ClassificationSchema),
  output_artifact: Type.Optional(Type.String()),
  sections: Type.Optional(Type.Array(SectionSchema)),
  llm_system_prompt: Type.Optional(Type.String()),
  completion_criteria: Type.Optional(Type.String()),
});

// --- Derived types ---
export type AnswerType = Static<typeof AnswerTypeSchema>;
export type Classification = Static<typeof ClassificationSchema>;
export type QuestionOption = Static<typeof QuestionOptionSchema>;
export type QuestionCondition = Static<typeof QuestionConditionSchema>;
export type TextValidation = Static<typeof TextValidationSchema>;
export type HardStop = Static<typeof HardStopSchema>;
export type Section = Static<typeof SectionSchema>;
export type Question = Static<typeof QuestionSchema>;
export type Questionnaire = Static<typeof QuestionnaireSchema>;

// --- Form engine response types ---
export interface FormQuestion {
  id: string;
  text: string;
  answer_type: AnswerType;
  required: boolean;
  options?: QuestionOption[];
  llm_guidance?: string;
  classification?: Classification;
  mode?: 'structured' | 'guided';
  validation?: TextValidation;
}

export interface FormProgress {
  current: number;
  total: number;
  percentage: number;
}

export type FormResponse =
  | { status: 'question'; question: FormQuestion; progress: FormProgress }
  | { status: 'completed'; artifacts: Record<string, unknown>; progress: FormProgress }
  | { status: 'hard_stop'; hard_stop_message: string };

export interface ValidationResult {
  valid: boolean;
  error?: string;
}
