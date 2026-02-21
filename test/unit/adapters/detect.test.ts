/**
 * Unit tests for platform detection (duck-typing).
 */

import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../../../src/adapters/detect.js';

describe('detectPlatform', () => {
  it('returns "openclaw" when API has registerCli and on methods', () => {
    const api = {
      registerCli: () => {},
      on: () => {},
    };
    expect(detectPlatform(api)).toBe('openclaw');
  });

  it('returns "standalone" for empty object', () => {
    expect(detectPlatform({})).toBe('standalone');
  });

  it('returns "standalone" for null', () => {
    expect(detectPlatform(null)).toBe('standalone');
  });

  it('returns "standalone" for undefined', () => {
    expect(detectPlatform(undefined)).toBe('standalone');
  });

  it('returns "standalone" when only registerCli is present (no on)', () => {
    const api = { registerCli: () => {} };
    expect(detectPlatform(api)).toBe('standalone');
  });

  it('returns "standalone" when registerCli is not a function', () => {
    const api = { registerCli: 'not a function', on: () => {} };
    expect(detectPlatform(api)).toBe('standalone');
  });
});
