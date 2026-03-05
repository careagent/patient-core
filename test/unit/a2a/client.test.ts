/**
 * Tests for PatientA2AClient — JSON-RPC 2.0 A2A client for patient-core.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatientA2AClient } from '../../../src/a2a/client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function rpcSuccess(result: unknown) {
  return { jsonrpc: '2.0', id: 'test-id', result };
}

function rpcError(code: number, message: string) {
  return { jsonrpc: '2.0', id: 'test-id', error: { code, message } };
}

// ---------------------------------------------------------------------------
// discoverProviders
// ---------------------------------------------------------------------------

describe('PatientA2AClient', () => {
  let client: PatientA2AClient;
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn();
    client = new PatientA2AClient({
      axonUrl: 'http://axon.test:9999',
      patientAgentId: 'patient-123',
      fetchFn,
    });
  });

  describe('discoverProviders', () => {
    it('queries Axon with specialty and location params', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ id: 'card-1', name: 'Dr. Test' }]),
      });

      const result = await client.discoverProviders({
        specialty: 'neurosurgery',
        location: { state: 'SC', city: 'Charleston' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Dr. Test');

      const url = fetchFn.mock.calls[0][0] as string;
      expect(url).toContain('/v1/agent-cards/search');
      expect(url).toContain('specialty=neurosurgery');
      expect(url).toContain('state=SC');
      expect(url).toContain('city=Charleston');
    });

    it('returns empty array on network error', async () => {
      fetchFn.mockRejectedValue(new Error('connection refused'));
      const result = await client.discoverProviders({ specialty: 'cardiology' });
      expect(result).toEqual([]);
    });

    it('returns empty array on non-OK response', async () => {
      fetchFn.mockResolvedValue({ ok: false, status: 500 });
      const result = await client.discoverProviders({ specialty: 'cardiology' });
      expect(result).toEqual([]);
    });

    it('returns empty array on invalid JSON', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('bad json')),
      });
      const result = await client.discoverProviders({});
      expect(result).toEqual([]);
    });

    it('returns empty array when response is not an array', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ error: 'not an array' }),
      });
      const result = await client.discoverProviders({});
      expect(result).toEqual([]);
    });

    it('includes provider_type in query params', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });

      await client.discoverProviders({ provider_type: 'physician' });
      const url = fetchFn.mock.calls[0][0] as string;
      expect(url).toContain('provider_type=physician');
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage
  // -------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('sends JSON-RPC SendMessage to Neuron', async () => {
      const task = { id: 'task-1', status: { state: 'submitted' } };
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rpcSuccess(task)),
      });

      const message = { role: 'user' as const, parts: [{ type: 'text' as const, text: 'hello' }] };
      const result = await client.sendMessage('http://neuron.test:3000', message, 'task-1', 'session-1');

      expect(result).toEqual(task);

      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('message/send');
      expect(body.params.id).toBe('task-1');
      expect(body.params.sessionId).toBe('session-1');
    });

    it('appends /a2a to URL if not present', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rpcSuccess({ id: 't1', status: { state: 'submitted' } })),
      });

      const msg = { role: 'user' as const, parts: [] };
      await client.sendMessage('http://neuron.test:3000', msg);

      const url = fetchFn.mock.calls[0][0] as string;
      expect(url).toBe('http://neuron.test:3000/a2a');
    });

    it('does not double-append /a2a', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rpcSuccess({ id: 't1', status: { state: 'submitted' } })),
      });

      const msg = { role: 'user' as const, parts: [] };
      await client.sendMessage('http://neuron.test:3000/a2a', msg);

      const url = fetchFn.mock.calls[0][0] as string;
      expect(url).toBe('http://neuron.test:3000/a2a');
    });

    it('generates task ID when not provided', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rpcSuccess({ id: 'auto', status: { state: 'submitted' } })),
      });

      const msg = { role: 'user' as const, parts: [] };
      await client.sendMessage('http://neuron.test:3000', msg);

      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      expect(body.params.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  // -------------------------------------------------------------------------
  // getTask
  // -------------------------------------------------------------------------

  describe('getTask', () => {
    it('retrieves task by ID', async () => {
      const task = { id: 'task-1', status: { state: 'completed' } };
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rpcSuccess(task)),
      });

      const result = await client.getTask('http://neuron.test:3000', 'task-1');
      expect(result).toEqual(task);

      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      expect(body.method).toBe('tasks/get');
      expect(body.params.id).toBe('task-1');
    });
  });

  // -------------------------------------------------------------------------
  // submitEnrollmentAnswer
  // -------------------------------------------------------------------------

  describe('submitEnrollmentAnswer', () => {
    it('wraps answers in DataPart with classification metadata', async () => {
      const task = { id: 'enroll-1', status: { state: 'input-required' } };
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rpcSuccess(task)),
      });

      const result = await client.submitEnrollmentAnswer('patient_onboarding', {
        name: 'Elizabeth Anderson',
      });

      expect(result.status.state).toBe('input-required');

      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      const message = body.params.message;
      expect(message.role).toBe('user');
      expect(message.parts[0].type).toBe('data');
      expect(message.parts[0].data.questionnaire_id).toBe('patient_onboarding');
      expect(message.parts[0].data.answers.name).toBe('Elizabeth Anderson');
      expect(message.parts[0].metadata.classification.domain).toBe('administrative');
      expect(body.params.metadata.flow).toBe('enrollment');
      expect(body.params.metadata.patient_agent_id).toBe('patient-123');
    });
  });

  // -------------------------------------------------------------------------
  // enroll
  // -------------------------------------------------------------------------

  describe('enroll', () => {
    it('sends patient registration to Axon', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rpcSuccess(null)),
      });

      await client.enroll({ name: 'Elizabeth Anderson', consent_posture: 'deny' });

      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      const data = body.params.message.parts[0].data;
      expect(data.name).toBe('Elizabeth Anderson');
      expect(data.consent_posture).toBe('deny');
      expect(data.identity_type).toBe('patient');
      expect(body.params.metadata.flow).toBe('patient_enrollment');
      expect(body.params.message.parts[0].metadata.classification.sensitivity).toBe('sensitive');
    });
  });

  // -------------------------------------------------------------------------
  // rpc error handling
  // -------------------------------------------------------------------------

  describe('rpc error handling', () => {
    it('throws on network failure', async () => {
      fetchFn.mockRejectedValue(new Error('ECONNREFUSED'));
      const msg = { role: 'user' as const, parts: [] };
      await expect(client.sendMessage('http://bad.test', msg)).rejects.toThrow(
        'A2A RPC network error',
      );
    });

    it('throws on invalid JSON response', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('parse error')),
      });

      const msg = { role: 'user' as const, parts: [] };
      await expect(client.sendMessage('http://bad.test', msg)).rejects.toThrow(
        'A2A RPC invalid JSON response',
      );
    });

    it('throws on JSON-RPC error response', async () => {
      fetchFn.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rpcError(-32601, 'Method not found')),
      });

      const msg = { role: 'user' as const, parts: [] };
      await expect(client.sendMessage('http://bad.test', msg)).rejects.toThrow(
        'A2A RPC error [-32601]: Method not found',
      );
    });
  });
});
