/**
 * Discovery module barrel export.
 *
 * Provides Axon registry discovery, connection handshake, and
 * Ed25519 cryptographic operations for the patient-provider pairing flow.
 */

export {
  // Schemas and types
  Base64UrlString,
  CredentialStatusSchema,
  CredentialRecordSchema,
  NeuronEndpointSchema,
  OrganizationAffiliationSchema,
  RegistryEntrySchema,
  ConnectRequestSchema,
  SignedMessageSchema,
  ConnectGrantSchema,
  DenialCodeSchema,
  ConnectDenialSchema,
  DiscoveryResultSchema,
  HandshakeResultSchema,
  RegistryEntryValidator,
  ConnectGrantValidator,
  ConnectDenialValidator,
  SignedMessageValidator,
  type CredentialStatus,
  type RegistryEntry,
  type ConnectRequest,
  type SignedMessage,
  type ConnectGrant,
  type ConnectDenial,
  type DenialCode,
  type DiscoveryResult,
  type HandshakeResult,
} from './schemas.js';

export {
  // Axon client
  createAxonClient,
  type AxonClient,
  type AxonClientConfig,
} from './client.js';

export {
  // Cryptographic operations
  publicKeyToBase64Url,
  privateKeyToBase64Url,
  signPayload,
  verifySignature,
  importPublicKey,
  importPrivateKey,
  generateNonce,
} from './crypto.js';

export {
  // Discovery + handshake orchestrator
  createDiscoveryHandshake,
  type DiscoveryHandshake,
  type DiscoveryHandshakeConfig,
  type DiscoveryAndHandshakeResult,
  type HandshakeLedgerEntry,
} from './handshake.js';
