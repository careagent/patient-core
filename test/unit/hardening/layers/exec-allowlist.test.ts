/**
 * Unit tests for Layer 2: Exec Allowlist.
 */

import { describe, it, expect } from 'vitest';
import { checkExecAllowlist } from '../../../../src/hardening/layers/exec-allowlist.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';
import type { ToolCallEvent } from '../../../../src/adapters/types.js';

const cans = { version: '1', identity_type: 'patient' } as CANSDocument;

describe('checkExecAllowlist', () => {
  it('allows non-exec tool calls (pass-through)', () => {
    const event: ToolCallEvent = { toolName: 'Read' };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.reason).toBe('not an exec call');
  });

  it('allows allowed binary (cat)', () => {
    const event: ToolCallEvent = { toolName: 'Bash', params: { command: 'cat file.txt' } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(true);
    expect(result.layer).toBe('exec-allowlist');
  });

  it('allows allowed binary with full path (/bin/ls)', () => {
    const event: ToolCallEvent = { toolName: 'Bash', params: { command: '/bin/ls -la' } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(true);
  });

  it('allows allowed binary with /usr/bin/ path', () => {
    const event: ToolCallEvent = { toolName: 'Bash', params: { command: '/usr/bin/git status' } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(true);
  });

  it('allows git', () => {
    const event: ToolCallEvent = { toolName: 'Bash', params: { command: 'git status' } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(true);
  });

  it('denies disallowed binary (rm)', () => {
    const event: ToolCallEvent = { toolName: 'Bash', params: { command: 'rm -rf /' } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(false);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.reason).toContain("'rm'");
  });

  it('denies disallowed binary (curl)', () => {
    const event: ToolCallEvent = { toolName: 'Bash', params: { command: 'curl https://example.com' } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("'curl'");
  });

  it('denies empty exec command', () => {
    const event: ToolCallEvent = { toolName: 'Bash', params: { command: '' } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('empty exec command');
  });

  it('denies when command param is not a string', () => {
    const event: ToolCallEvent = { toolName: 'Bash', params: { command: 123 } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('empty exec command');
  });

  it('handles exec tool name', () => {
    const event: ToolCallEvent = { toolName: 'exec', params: { command: 'cat file.txt' } };
    const result = checkExecAllowlist(event, cans);
    expect(result.allowed).toBe(true);
  });
});
