/**
 * A2A Client for patient-core.
 *
 * Provides JSON-RPC 2.0 transport for communicating with Axon (registry,
 * enrollment) and Neuron (provider routing, messaging). All requests and
 * responses use @careagent/a2a-types schemas.
 *
 * Discovery queries Axon's Agent Card registry. Messaging uses A2A
 * SendMessage via Neuron endpoints. Enrollment submits form answers to
 * Axon's deterministic form engine wrapped in A2A Task format.
 */

import { randomUUID } from 'node:crypto';
import type { AgentCard, Task, Message } from '@careagent/a2a-types';
import { A2A_METHODS } from '@careagent/a2a-types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PatientA2AClientConfig {
  /** Base URL of the Axon registry (e.g., 'http://147.93.114.93:9999'). */
  axonUrl: string;
  /** Unique identifier for this patient agent. */
  patientAgentId: string;
  /** Optional fetch implementation for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class PatientA2AClient {
  private readonly axonUrl: string;
  private readonly patientAgentId: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: PatientA2AClientConfig) {
    this.axonUrl = config.axonUrl;
    this.patientAgentId = config.patientAgentId;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  /**
   * Discover providers by specialty and location via Axon's Agent Card registry.
   *
   * Sends a search query to Axon and returns matching Agent Cards. The query
   * is flexible: any combination of specialty, location fields, and provider
   * type can be specified.
   */
  async discoverProviders(query: {
    specialty?: string;
    location?: { state?: string; city?: string; zip?: string };
    provider_type?: string;
  }): Promise<AgentCard[]> {
    const params = new URLSearchParams();
    if (query.specialty) params.set('specialty', query.specialty);
    if (query.provider_type) params.set('provider_type', query.provider_type);
    if (query.location?.state) params.set('state', query.location.state);
    if (query.location?.city) params.set('city', query.location.city);
    if (query.location?.zip) params.set('zip', query.location.zip);

    const url = `${this.axonUrl}/v1/agent-cards/search?${params.toString()}`;

    let res: Response;
    try {
      res = await this.fetchFn(url);
    } catch {
      return [];
    }

    if (!res.ok) {
      return [];
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return [];
    }

    if (!Array.isArray(body)) {
      return [];
    }

    return body as AgentCard[];
  }

  /**
   * Send a message to a provider agent via their Neuron endpoint.
   *
   * Uses JSON-RPC 2.0 with the A2A SendMessage method. Creates or continues
   * a task identified by taskId. Returns the updated Task.
   */
  async sendMessage(
    neuronUrl: string,
    message: Message,
    taskId?: string,
    sessionId?: string,
  ): Promise<Task> {
    const id = taskId ?? randomUUID();
    const result = await this.rpc(neuronUrl, A2A_METHODS.SEND_MESSAGE, {
      id,
      sessionId,
      message,
    });
    return result as Task;
  }

  /**
   * Get the current status of a task from a Neuron endpoint.
   */
  async getTask(neuronUrl: string, taskId: string): Promise<Task> {
    const result = await this.rpc(neuronUrl, A2A_METHODS.GET_TASK, {
      id: taskId,
    });
    return result as Task;
  }

  /**
   * Submit a form answer to Axon for enrollment via A2A Task format.
   *
   * Wraps the patient's answers in an A2A Message with a DataPart and sends
   * them to Axon's form engine endpoint. The form engine returns the next
   * question or completion status as an A2A Task.
   */
  async submitEnrollmentAnswer(
    questionnaireId: string,
    answers: Record<string, unknown>,
  ): Promise<Task> {
    const message: Message = {
      role: 'user',
      parts: [
        {
          type: 'data',
          data: {
            questionnaire_id: questionnaireId,
            answers,
          },
          metadata: {
            classification: {
              domain: 'administrative',
              sensitivity: 'non_sensitive',
            },
          },
        },
      ],
    };

    const taskId = randomUUID();
    const result = await this.rpc(
      this.axonUrl,
      A2A_METHODS.SEND_MESSAGE,
      {
        id: taskId,
        message,
        metadata: {
          patient_agent_id: this.patientAgentId,
          flow: 'enrollment',
        },
      },
    );
    return result as Task;
  }

  /**
   * Register patient CANS and create A2A identity with Axon.
   *
   * Sends patient enrollment data to Axon to register this patient agent
   * in the network. This is a lightweight registration -- the full CANS.md
   * is generated and stored locally, not transmitted.
   */
  async enroll(cansData: {
    name: string;
    consent_posture: string;
  }): Promise<void> {
    const message: Message = {
      role: 'user',
      parts: [
        {
          type: 'data',
          data: {
            agent_id: this.patientAgentId,
            name: cansData.name,
            consent_posture: cansData.consent_posture,
            identity_type: 'patient',
          },
          metadata: {
            classification: {
              domain: 'administrative',
              sensitivity: 'sensitive',
            },
          },
        },
      ],
    };

    await this.rpc(this.axonUrl, A2A_METHODS.SEND_MESSAGE, {
      id: randomUUID(),
      message,
      metadata: {
        patient_agent_id: this.patientAgentId,
        flow: 'patient_enrollment',
      },
    });
  }

  /**
   * Send a JSON-RPC 2.0 request and return the result.
   *
   * @throws Error if the response contains a JSON-RPC error or network failure.
   */
  async rpc(
    url: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const rpcUrl = url.endsWith('/a2a') ? url : `${url}/a2a`;
    const requestId = randomUUID();

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    });

    let res: Response;
    try {
      res = await this.fetchFn(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (err) {
      throw new Error(`A2A RPC network error: ${(err as Error).message}`);
    }

    let responseBody: unknown;
    try {
      responseBody = await res.json();
    } catch {
      throw new Error(`A2A RPC invalid JSON response (status ${res.status})`);
    }

    const rpcResponse = responseBody as {
      jsonrpc: string;
      id: string | number | null;
      result?: unknown;
      error?: { code: number; message: string; data?: unknown };
    };

    if (rpcResponse.error) {
      throw new Error(
        `A2A RPC error [${rpcResponse.error.code}]: ${rpcResponse.error.message}`,
      );
    }

    return rpcResponse.result;
  }
}
