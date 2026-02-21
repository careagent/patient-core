/**
 * Unit tests for Layer 1: Tool Policy Lockdown.
 */

import { describe, it, expect } from 'vitest';
import { checkToolPolicy } from '../../../../src/hardening/layers/tool-policy.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';
import type { ToolCallEvent } from '../../../../src/adapters/types.js';

function createCans(permittedActions?: string[]): CANSDocument {
  const doc: Record<string, unknown> = {
    version: '1',
    identity_type: 'patient',
  };
  if (permittedActions) {
    doc.scope = { permitted_actions: permittedActions };
  }
  return doc as CANSDocument;
}

describe('checkToolPolicy', () => {
  it('allows tool when no policy configured (no scope)', () => {
    const event: ToolCallEvent = { toolName: 'Read' };
    const result = checkToolPolicy(event, createCans());
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('tool-policy');
    expect(result.reason).toContain('no tool policy configured');
  });

  it('allows tool when in permitted_actions', () => {
    const event: ToolCallEvent = { toolName: 'Read' };
    const result = checkToolPolicy(event, createCans(['Read', 'Write']));
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('tool-policy');
  });

  it('denies tool when not in permitted_actions', () => {
    const event: ToolCallEvent = { toolName: 'Delete' };
    const result = checkToolPolicy(event, createCans(['Read', 'Write']));
    expect(result.allowed).toBe(false);
    expect(result.layer).toBe('tool-policy');
    expect(result.reason).toContain("'Delete'");
    expect(result.reason).toContain('not in permitted_actions');
  });

  it('denies tool with empty permitted_actions list', () => {
    const event: ToolCallEvent = { toolName: 'Read' };
    const result = checkToolPolicy(event, createCans([]));
    expect(result.allowed).toBe(false);
    expect(result.layer).toBe('tool-policy');
  });
});
