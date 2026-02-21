/**
 * Unit tests for Layer 3: CANS Protocol Injection.
 */

import { describe, it, expect, vi } from 'vitest';
import { checkCansInjection, extractProtocolRules, injectProtocol } from '../../../../src/hardening/layers/cans-injection.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';
import type { BootstrapContext } from '../../../../src/adapters/types.js';

const cans = { version: '1', identity_type: 'patient' } as CANSDocument;

describe('checkCansInjection', () => {
  it('always returns allowed (pass-through layer)', () => {
    const result = checkCansInjection({ toolName: 'Read' }, cans);
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('cans-injection');
    expect(result.reason).toBe('protocol injected at bootstrap');
  });
});

describe('extractProtocolRules', () => {
  it('returns string containing CareAgent Patient Protocol header', () => {
    const rules = extractProtocolRules(cans);
    expect(rules).toContain('CareAgent Patient Protocol');
  });

  it('includes identity_type in output', () => {
    const rules = extractProtocolRules(cans);
    expect(rules).toContain('patient');
  });

  it('includes consent warning', () => {
    const rules = extractProtocolRules(cans);
    expect(rules).toContain('NEVER share patient data without explicit consent');
  });

  it('includes scope boundaries when scope is defined', () => {
    const cansWithScope = {
      version: '1',
      identity_type: 'patient',
      scope: { permitted_actions: ['Read', 'Write'] },
    } as unknown as CANSDocument;

    const rules = extractProtocolRules(cansWithScope);
    expect(rules).toContain('Scope Boundaries');
    expect(rules).toContain('Read, Write');
  });
});

describe('injectProtocol', () => {
  it('adds CAREAGENT_PROTOCOL.md to bootstrap context', () => {
    const context: BootstrapContext = { addFile: vi.fn() };
    injectProtocol(context, cans);
    expect(context.addFile).toHaveBeenCalledWith(
      'CAREAGENT_PROTOCOL.md',
      expect.stringContaining('CareAgent Patient Protocol'),
    );
  });
});
