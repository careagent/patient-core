/**
 * CANS.md YAML frontmatter parser -- stub for Phase 2.
 *
 * Mirrors provider-core's cans-parser.ts. The full implementation
 * will parse YAML frontmatter from CANS.md files.
 */

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
  error?: string;
}

/**
 * Parse YAML frontmatter from a CANS.md file.
 * @throws Error - Always throws in Phase 1 (not yet implemented).
 */
export function parseCANS(_content: string): ParsedFrontmatter {
  throw new Error('CANS parser not yet implemented (Phase 2)');
}
