/**
 * Neuron client types -- interfaces for Neuron network integration.
 *
 * Mirrors provider-core's neuron types. The Neuron network connects
 * patient-core instances to the broader CareAgent ecosystem.
 *
 * Stub interfaces -- implementation arrives in Phase 6+.
 */

/** Registration details for connecting to a Neuron endpoint. */
export interface NeuronRegistration {
  endpoint: string;
  registrationId?: string;
  patientName: string;
}

/**
 * The Neuron client -- manages connection to the Neuron network.
 */
export interface NeuronClient {
  /** Register this patient-core instance with a Neuron endpoint. */
  register(config: NeuronRegistration): Promise<{ registrationId: string; status: string }>;

  /** Check the connection to the Neuron network. */
  heartbeat(): Promise<{ connected: boolean; lastSeen?: string }>;

  /** Cleanly disconnect from the Neuron network. */
  disconnect(): Promise<void>;
}
