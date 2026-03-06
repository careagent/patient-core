/**
 * Loads and exports the patient onboarding questionnaire definition.
 *
 * Reads the JSON file from data/questionnaires/ and validates it against
 * the QuestionnaireSchema at load time.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Value } from '@sinclair/typebox/value';
import { QuestionnaireSchema, type Questionnaire } from './questionnaire-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the path to the questionnaire JSON file.
 *
 * tsdown bundles code into flat chunks in dist/, so __dirname may be
 * dist/ (not dist/onboarding/). We walk up from __dirname looking for
 * package.json to find the package root reliably.
 */
function resolveQuestionnairePath(): string {
  const target = join('data', 'questionnaires', 'patient_onboarding.json');

  // Walk up from __dirname to find the package root (has package.json)
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, target);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  // Fallback: assume __dirname is in dist/ or dist/entry/
  return join(__dirname, '..', target);
}

let cached: Questionnaire | null = null;

/**
 * Load the patient onboarding questionnaire.
 *
 * Validates against QuestionnaireSchema on first load. Result is cached.
 *
 * @throws Error if the file is missing or fails validation.
 */
export function loadPatientOnboardingQuestionnaire(): Questionnaire {
  if (cached) return cached;

  const filePath = resolveQuestionnairePath();
  const raw = readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (!Value.Check(QuestionnaireSchema, parsed)) {
    const errors = [...Value.Errors(QuestionnaireSchema, parsed)];
    const summary = errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Invalid patient_onboarding questionnaire: ${summary}`);
  }

  cached = parsed;
  return cached;
}

/**
 * Clear the cached questionnaire (for testing).
 */
export function clearQuestionnaireCache(): void {
  cached = null;
}
