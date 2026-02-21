/**
 * CANS.md YAML frontmatter parser -- full implementation.
 *
 * Parses YAML frontmatter from CANS.md files. Handles edge cases:
 * - No frontmatter delimiters: returns { frontmatter: null, body: content }
 * - Empty frontmatter (---\n---): returns error, not a crash
 * - Malformed YAML: returns error string with parse details
 * - Valid frontmatter: returns parsed object and body text
 */

import { parseYAML } from '../vendor/yaml/index.js';

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
  error?: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n?---/;

/**
 * Parse YAML frontmatter from a CANS.md file.
 *
 * Returns frontmatter object for valid YAML, error string for malformed YAML,
 * and null frontmatter for no delimiters.
 */
export function parseCANS(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_RE);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  let parsed: unknown;
  try {
    parsed = parseYAML(match[1]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { frontmatter: null, body: content, error: `YAML parse error: ${message}` };
  }

  // Handle empty frontmatter: yaml returns null for empty string
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { frontmatter: null, body: content, error: 'frontmatter is empty or not an object' };
  }

  const body = content.slice(match[0].length).trimStart();
  return { frontmatter: parsed as Record<string, unknown>, body };
}
