/**
 * Tests for CANS.md generator.
 */

import { describe, it, expect } from 'vitest';
import { generateCANS } from '../../../src/onboarding/cans-generator.js';

describe('generateCANS', () => {
  it('generates CANS.md with identity_type: patient', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
    });

    expect(result).toContain('identity_type: patient');
  });

  it('generates CANS.md with deny consent posture', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
    });

    expect(result).toContain('consent_posture: deny');
  });

  it('includes schema_version', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
    });

    expect(result).toContain('schema_version');
  });

  it('includes health_literacy_level', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
    });

    expect(result).toContain('health_literacy_level: standard');
  });

  it('includes patient ID in body', () => {
    const result = generateCANS({
      patient_id: 'my-test-uuid',
      public_key: 'base64key==',
    });

    expect(result).toContain('my-test-uuid');
  });

  it('includes public key in body', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'my-base64-key==',
    });

    expect(result).toContain('my-base64-key==');
  });

  it('has YAML frontmatter delimiters', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
    });

    expect(result).toMatch(/^---\n/);
    expect(result).toContain('\n---\n');
  });

  it('generates valid YAML frontmatter that can be parsed', async () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
    });

    // Extract frontmatter
    const match = result.match(/^---\n([\s\S]*?)\n---/);
    expect(match).not.toBeNull();

    // The YAML should be parseable
    const { parseYAML } = await import('../../../src/vendor/yaml/index.js');
    const parsed = parseYAML(match![1]);
    expect(parsed.identity_type).toBe('patient');
    expect(parsed.consent_posture).toBe('deny');
    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.health_literacy_level).toBe('standard');
  });

  it('accepts custom health_literacy_level', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
      health_literacy_level: 'simplified',
    });

    expect(result).toContain('health_literacy_level: simplified');
  });

  it('accepts custom consent_posture', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
      consent_posture: 'allow',
    });

    expect(result).toContain('consent_posture: allow');
  });

  it('includes preferred_language when provided', async () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
      preferred_language: 'Spanish',
    });

    expect(result).toContain('preferred_language: Spanish');

    const { parseYAML } = await import('../../../src/vendor/yaml/index.js');
    const match = result.match(/^---\n([\s\S]*?)\n---/);
    const parsed = parseYAML(match![1]);
    expect(parsed.preferred_language).toBe('Spanish');
  });

  it('omits preferred_language when not provided', () => {
    const result = generateCANS({
      patient_id: 'test-uuid',
      public_key: 'base64key==',
    });

    expect(result).not.toContain('preferred_language');
  });
});
