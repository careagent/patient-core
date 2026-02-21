/**
 * Reusable prompt utilities built on InterviewIO.
 * All functions take io: InterviewIO as the first parameter.
 *
 * Mirrors provider-core's prompts.ts. Stub for Phase 4.
 */

import type { InterviewIO } from './io.js';

export async function askText(
  io: InterviewIO,
  prompt: string,
  opts?: { required?: boolean; minLength?: number; maxLength?: number },
): Promise<string> {
  const answer = await io.question(prompt);
  const trimmed = answer.trim();

  if (opts?.required && trimmed.length === 0) {
    io.display('This field is required.');
    return askText(io, prompt, opts);
  }

  if (opts?.minLength !== undefined && trimmed.length < opts.minLength) {
    io.display(`Minimum length is ${opts.minLength} characters.`);
    return askText(io, prompt, opts);
  }

  if (opts?.maxLength !== undefined && trimmed.length > opts.maxLength) {
    io.display(`Maximum length is ${opts.maxLength} characters.`);
    return askText(io, prompt, opts);
  }

  return trimmed;
}

export async function askOptionalText(
  io: InterviewIO,
  prompt: string,
): Promise<string | undefined> {
  const answer = await io.question(prompt + ' (press Enter to skip) ');
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function askSelect(
  io: InterviewIO,
  prompt: string,
  options: string[],
): Promise<number> {
  return io.select(prompt, options);
}

export async function askConfirm(
  io: InterviewIO,
  prompt: string,
): Promise<boolean> {
  return io.confirm(prompt);
}

/**
 * Ask for a comma-separated list of strings, returned as a trimmed array.
 * If required, ensures at least one non-empty entry.
 */
export async function askStringArray(
  io: InterviewIO,
  prompt: string,
  opts?: { required?: boolean },
): Promise<string[]> {
  const raw = await io.question(prompt);
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (opts?.required && items.length === 0) {
    io.display('At least one entry is required.');
    return askStringArray(io, prompt, opts);
  }

  return items;
}
