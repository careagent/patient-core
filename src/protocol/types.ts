/**
 * Protocol server types -- interfaces for the cross-installation protocol.
 *
 * Mirrors provider-core's protocol types. The protocol server handles
 * inbound communication from provider CareAgent installations.
 *
 * Stub interfaces -- implementation arrives in Phase 6.
 */

/** An active protocol session between two agents. */
export interface ProtocolSession {
  sessionId: string;
  patientAgentId: string;
  providerAgentId: string;
  startedAt: string;
  status: 'active' | 'completed' | 'terminated';
}

/**
 * The protocol server -- manages inbound cross-installation communication.
 */
export interface ProtocolServer {
  /** Start the inbound channel endpoint on the given port. */
  start(port: number): Promise<void>;

  /** Gracefully shut down the protocol server. */
  stop(): Promise<void>;

  /** List all currently active protocol sessions. */
  activeSessions(): ProtocolSession[];
}
