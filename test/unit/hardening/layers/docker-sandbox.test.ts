/**
 * Unit tests for Layer 4: Docker Sandbox Detection.
 */

import { describe, it, expect } from 'vitest';
import { checkDockerSandbox, detectDocker } from '../../../../src/hardening/layers/docker-sandbox.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';

const cans = { version: '1', identity_type: 'patient' } as CANSDocument;

describe('checkDockerSandbox', () => {
  it('always returns allowed (report-only layer)', () => {
    const result = checkDockerSandbox({ toolName: 'Read' }, cans);
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('docker-sandbox');
  });

  it('reports sandbox status in reason', () => {
    const result = checkDockerSandbox({ toolName: 'Read' }, cans);
    expect(result.reason).toBeDefined();
    // On typical dev machines, no container is detected
    expect(typeof result.reason).toBe('string');
  });
});

describe('detectDocker', () => {
  it('returns a DockerDetectionResult', () => {
    const result = detectDocker();
    expect(typeof result.inContainer).toBe('boolean');
    expect(Array.isArray(result.signals)).toBe(true);
  });

  it('inContainer is false on typical dev machines', () => {
    // This test may fail inside Docker -- that is expected
    const result = detectDocker();
    if (!process.env.CONTAINER && !process.env.DOCKER) {
      expect(result.inContainer).toBe(false);
      expect(result.signals).toHaveLength(0);
    }
  });
});
