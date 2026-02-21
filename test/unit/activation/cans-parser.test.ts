/**
 * Unit tests for parseCANS including all edge cases.
 *
 * Validates YAML frontmatter parsing behavior:
 * - Valid minimal frontmatter
 * - No delimiters (plain markdown)
 * - Empty frontmatter (---\n---)
 * - Malformed YAML
 * - Body content after frontmatter
 * - YAML array at top level
 */

import { describe, it, expect } from 'vitest';
import { parseCANS } from '../../../src/activation/cans-parser.js';

describe('parseCANS', () => {
  it('returns parsed frontmatter for minimal valid YAML', () => {
    const content = `---
schema_version: "1.0"
identity_type: patient
consent_posture: deny
health_literacy_level: standard
---
`;
    const result = parseCANS(content);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter!.schema_version).toBe('1.0');
    expect(result.frontmatter!.identity_type).toBe('patient');
    expect(result.frontmatter!.consent_posture).toBe('deny');
    expect(result.frontmatter!.health_literacy_level).toBe('standard');
    expect(result.error).toBeUndefined();
  });

  it('returns { frontmatter: null, body: content } when no --- delimiters', () => {
    const content = 'Just some plain markdown text without frontmatter.';
    const result = parseCANS(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
    expect(result.error).toBeUndefined();
  });

  it('returns { frontmatter: null, error } for empty ---\\n---', () => {
    const content = '---\n---';
    const result = parseCANS(content);
    expect(result.frontmatter).toBeNull();
    expect(result.error).toBe('frontmatter is empty or not an object');
  });

  it('catches malformed YAML and returns error string (not thrown exception)', () => {
    const content = '---\nkey: [unbalanced bracket\n---';
    const result = parseCANS(content);
    expect(result.frontmatter).toBeNull();
    expect(result.error).toMatch(/YAML parse error:/);
  });

  it('returns body content after closing --- delimiter', () => {
    const content = `---
schema_version: "1.0"
identity_type: patient
consent_posture: deny
health_literacy_level: standard
---

# Patient CANS

Clinical Agent Navigation System.`;
    const result = parseCANS(content);
    expect(result.frontmatter).not.toBeNull();
    expect(result.body).toContain('# Patient CANS');
    expect(result.body).toContain('Clinical Agent Navigation System.');
  });

  it('treats YAML array at top level as not-an-object error', () => {
    const content = '---\n- item1\n- item2\n---';
    const result = parseCANS(content);
    expect(result.frontmatter).toBeNull();
    expect(result.error).toBe('frontmatter is empty or not an object');
  });
});
