/**
 * TypeBox schemas for Axon registry API requests/responses and handshake messages.
 *
 * These mirror the Axon protocol schemas from the patient side:
 * - Registry lookup response (RegistryEntry)
 * - Connect request/grant/denial (broker pipeline)
 * - Signed message envelope (Ed25519)
 *
 * All boundary data is validated against these schemas before use.
 */

import { Type, type Static } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

// ---------------------------------------------------------------------------
// Base types
// ---------------------------------------------------------------------------

/** Base64url string pattern (A-Z, a-z, 0-9, -, _). */
export const Base64UrlString = Type.String({ pattern: '^[A-Za-z0-9_-]+$' });

// ---------------------------------------------------------------------------
// Credential schemas (subset of Axon registry)
// ---------------------------------------------------------------------------

export const CredentialStatusSchema = Type.Union([
  Type.Literal('active'),
  Type.Literal('pending'),
  Type.Literal('expired'),
  Type.Literal('suspended'),
  Type.Literal('revoked'),
]);

export type CredentialStatus = Static<typeof CredentialStatusSchema>;

export const CredentialRecordSchema = Type.Object({
  type: Type.Union([
    Type.Literal('license'),
    Type.Literal('certification'),
    Type.Literal('privilege'),
  ]),
  issuer: Type.String(),
  identifier: Type.String(),
  status: CredentialStatusSchema,
  issued_at: Type.Optional(Type.String()),
  expires_at: Type.Optional(Type.String()),
  verification_source: Type.Union([
    Type.Literal('self_attested'),
    Type.Literal('nppes_matched'),
    Type.Literal('state_board_verified'),
  ]),
});

// ---------------------------------------------------------------------------
// Neuron endpoint schema
// ---------------------------------------------------------------------------

export const NeuronEndpointSchema = Type.Object({
  url: Type.String(),
  protocol_version: Type.String(),
  health_status: Type.Union([
    Type.Literal('reachable'),
    Type.Literal('unreachable'),
    Type.Literal('unknown'),
  ]),
  last_heartbeat: Type.Optional(Type.String()),
});

// ---------------------------------------------------------------------------
// Organization affiliation
// ---------------------------------------------------------------------------

export const OrganizationAffiliationSchema = Type.Object({
  organization_npi: Type.String(),
  organization_name: Type.String(),
  department: Type.Optional(Type.String()),
  privileges: Type.Optional(Type.Array(Type.String())),
  neuron_endpoint: Type.Optional(Type.String()),
});

// ---------------------------------------------------------------------------
// Registry entry (returned by GET /v1/registry/:npi)
// ---------------------------------------------------------------------------

export const RegistryEntrySchema = Type.Object({
  npi: Type.String(),
  entity_type: Type.Union([
    Type.Literal('individual'),
    Type.Literal('organization'),
  ]),
  name: Type.String(),
  credential_status: CredentialStatusSchema,
  provider_types: Type.Optional(Type.Array(Type.String())),
  degrees: Type.Optional(Type.Array(Type.String())),
  specialty: Type.Optional(Type.String()),
  subspecialty: Type.Optional(Type.String()),
  organization_name: Type.Optional(Type.String()),
  neuron_endpoint: Type.Optional(NeuronEndpointSchema),
  credentials: Type.Array(CredentialRecordSchema),
  affiliations: Type.Optional(Type.Array(OrganizationAffiliationSchema)),
  registered_at: Type.String(),
  last_updated: Type.String(),
  registry_version: Type.String(),
});

export type RegistryEntry = Static<typeof RegistryEntrySchema>;

// ---------------------------------------------------------------------------
// Connect request (sent to POST /v1/connect)
// ---------------------------------------------------------------------------

export const ConnectRequestSchema = Type.Object({
  version: Type.Literal('1.0.0'),
  type: Type.Literal('connect_request'),
  timestamp: Type.String(),
  nonce: Base64UrlString,
  patient_agent_id: Type.String(),
  provider_npi: Type.String(),
  patient_public_key: Base64UrlString,
});

export type ConnectRequest = Static<typeof ConnectRequestSchema>;

// ---------------------------------------------------------------------------
// Signed message envelope (wraps ConnectRequest for /v1/connect)
// ---------------------------------------------------------------------------

export const SignedMessageSchema = Type.Object({
  payload: Base64UrlString,
  signature: Base64UrlString,
});

export type SignedMessage = Static<typeof SignedMessageSchema>;

// ---------------------------------------------------------------------------
// Connect grant (returned by broker on success)
// ---------------------------------------------------------------------------

export const ConnectGrantSchema = Type.Object({
  type: Type.Literal('connect_grant'),
  connection_id: Type.String(),
  provider_npi: Type.String(),
  neuron_endpoint: Type.String(),
  protocol_version: Type.String(),
});

export type ConnectGrant = Static<typeof ConnectGrantSchema>;

// ---------------------------------------------------------------------------
// Denial codes
// ---------------------------------------------------------------------------

export const DenialCodeSchema = Type.Union([
  Type.Literal('SIGNATURE_INVALID'),
  Type.Literal('NONCE_REPLAYED'),
  Type.Literal('TIMESTAMP_EXPIRED'),
  Type.Literal('PROVIDER_NOT_FOUND'),
  Type.Literal('CREDENTIALS_INVALID'),
  Type.Literal('ENDPOINT_UNAVAILABLE'),
]);

export type DenialCode = Static<typeof DenialCodeSchema>;

// ---------------------------------------------------------------------------
// Connect denial (returned by broker on failure)
// ---------------------------------------------------------------------------

export const ConnectDenialSchema = Type.Object({
  type: Type.Literal('connect_denial'),
  connection_id: Type.String(),
  code: DenialCodeSchema,
  message: Type.String(),
});

export type ConnectDenial = Static<typeof ConnectDenialSchema>;

// ---------------------------------------------------------------------------
// Discovery result (internal -- encapsulates success or not-found)
// ---------------------------------------------------------------------------

export const DiscoveryResultSchema = Type.Object({
  found: Type.Boolean(),
  provider: Type.Optional(RegistryEntrySchema),
  neuronEndpoint: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});

export type DiscoveryResult = Static<typeof DiscoveryResultSchema>;

// ---------------------------------------------------------------------------
// Handshake result (internal -- encapsulates handshake outcome)
// ---------------------------------------------------------------------------

export const HandshakeResultSchema = Type.Object({
  status: Type.Union([
    Type.Literal('granted'),
    Type.Literal('denied'),
    Type.Literal('error'),
  ]),
  connectionId: Type.Optional(Type.String()),
  neuronEndpoint: Type.Optional(Type.String()),
  denialCode: Type.Optional(DenialCodeSchema),
  denialMessage: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});

export type HandshakeResult = Static<typeof HandshakeResultSchema>;

// ---------------------------------------------------------------------------
// Compiled validators
// ---------------------------------------------------------------------------

export const RegistryEntryValidator = TypeCompiler.Compile(RegistryEntrySchema);
export const ConnectGrantValidator = TypeCompiler.Compile(ConnectGrantSchema);
export const ConnectDenialValidator = TypeCompiler.Compile(ConnectDenialSchema);
export const SignedMessageValidator = TypeCompiler.Compile(SignedMessageSchema);
