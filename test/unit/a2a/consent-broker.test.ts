/**
 * Tests for ConsentBroker — consent-aware A2A communication gating.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsentBroker } from '../../../src/a2a/consent-broker.js';
import type { MessageIO } from '../../../src/a2a/consent-broker.js';
import type { AgentCard } from '@careagent/a2a-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProviderCard(overrides: Partial<AgentCard> = {}): AgentCard {
  return {
    id: 'provider-1',
    name: 'Dr. Thomas Anderson',
    description: 'Neurosurgeon at Southeastern Spine Institute',
    version: '1.0.0',
    url: 'http://neuron.test:3000',
    capabilities: [],
    authentication: { scheme: 'none' },
    careagent: {
      npi: '1275609489',
      organization: 'Southeastern Spine Institute',
      specialty: 'neurosurgery',
      clinical_actions: [],
      consent_required: true,
      classification: 'clinical',
    },
    ...overrides,
  } as AgentCard;
}

function makeMessageIO(confirmResult = true): MessageIO {
  return {
    display: vi.fn(),
    confirm: vi.fn().mockResolvedValue(confirmResult),
  };
}

// ---------------------------------------------------------------------------
// requestConsent
// ---------------------------------------------------------------------------

describe('ConsentBroker', () => {
  let broker: ConsentBroker;

  beforeEach(() => {
    broker = new ConsentBroker();
  });

  describe('requestConsent', () => {
    it('returns ConsentGrant when patient approves', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(true);

      const grant = await broker.requestConsent(
        card,
        ['consultation', 'share_history'],
        io,
      );

      expect(grant).not.toBeNull();
      expect(grant!.provider_npi).toBe('1275609489');
      expect(grant!.consented_actions).toEqual(['consultation', 'share_history']);
      expect(grant!.token).toBeTruthy();
      expect(new Date(grant!.expiration).getTime()).toBeGreaterThan(Date.now());
    });

    it('returns null when patient denies', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(false);

      const grant = await broker.requestConsent(card, ['consultation'], io);
      expect(grant).toBeNull();
    });

    it('displays provider information to patient', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(true);

      await broker.requestConsent(card, ['consultation'], io);

      const displayText = (io.display as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(displayText).toContain('Dr. Thomas Anderson');
      expect(displayText).toContain('1275609489');
      expect(displayText).toContain('Southeastern Spine Institute');
      expect(displayText).toContain('neurosurgery');
      expect(displayText).toContain('consultation');
    });

    it('sets 24-hour expiration', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(true);

      const before = Date.now();
      const grant = await broker.requestConsent(card, ['consultation'], io);
      const after = Date.now();

      const expiry = new Date(grant!.expiration).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      expect(expiry).toBeGreaterThanOrEqual(before + twentyFourHours - 1000);
      expect(expiry).toBeLessThanOrEqual(after + twentyFourHours + 1000);
    });

    it('handles missing careagent metadata gracefully', async () => {
      const card = makeProviderCard({ careagent: undefined } as unknown as Partial<AgentCard>);
      const io = makeMessageIO(true);

      const grant = await broker.requestConsent(card, ['consultation'], io);
      expect(grant!.provider_npi).toBe('unknown');
    });
  });

  // -------------------------------------------------------------------------
  // hasConsent
  // -------------------------------------------------------------------------

  describe('hasConsent', () => {
    it('returns true for active grant with matching action', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(true);
      await broker.requestConsent(card, ['consultation', 'share_history'], io);

      expect(broker.hasConsent('1275609489', 'consultation')).toBe(true);
      expect(broker.hasConsent('1275609489', 'share_history')).toBe(true);
    });

    it('returns false for non-consented action', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(true);
      await broker.requestConsent(card, ['consultation'], io);

      expect(broker.hasConsent('1275609489', 'share_history')).toBe(false);
    });

    it('returns false for unknown provider', () => {
      expect(broker.hasConsent('9999999999', 'consultation')).toBe(false);
    });

    it('returns false for expired grant', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(true);
      const grant = await broker.requestConsent(card, ['consultation'], io);

      // Manually expire the grant
      grant!.expiration = new Date(Date.now() - 1000).toISOString();

      expect(broker.hasConsent('1275609489', 'consultation')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // revokeConsent
  // -------------------------------------------------------------------------

  describe('revokeConsent', () => {
    it('removes the grant entirely', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(true);
      await broker.requestConsent(card, ['consultation'], io);

      expect(broker.hasConsent('1275609489', 'consultation')).toBe(true);
      broker.revokeConsent('1275609489');
      expect(broker.hasConsent('1275609489', 'consultation')).toBe(false);
    });

    it('is no-op for unknown provider', () => {
      expect(() => broker.revokeConsent('9999999999')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getConsent
  // -------------------------------------------------------------------------

  describe('getConsent', () => {
    it('returns the active grant', async () => {
      const card = makeProviderCard();
      const io = makeMessageIO(true);
      await broker.requestConsent(card, ['consultation'], io);

      const grant = broker.getConsent('1275609489');
      expect(grant).toBeDefined();
      expect(grant!.provider_npi).toBe('1275609489');
    });

    it('returns undefined for unknown provider', () => {
      expect(broker.getConsent('9999999999')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // connectToProvider
  // -------------------------------------------------------------------------

  describe('connectToProvider', () => {
    it('sends consent token to Neuron via A2A', async () => {
      const mockClient = {
        sendMessage: vi.fn().mockResolvedValue({
          id: 'task-1',
          status: { state: 'submitted' },
        }),
      };

      const grant = {
        provider_npi: '1275609489',
        consented_actions: ['consultation'],
        expiration: new Date(Date.now() + 86400000).toISOString(),
        token: 'consent-token-123',
      };

      const task = await broker.connectToProvider(
        'http://neuron.test:3000',
        grant,
        mockClient as unknown as import('../../../src/a2a/client.js').PatientA2AClient,
      );

      expect(task.status.state).toBe('submitted');
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        'http://neuron.test:3000',
        expect.objectContaining({
          role: 'user',
          parts: expect.arrayContaining([
            expect.objectContaining({
              type: 'data',
              data: expect.objectContaining({
                type: 'consent_connection_request',
                provider_npi: '1275609489',
              }),
            }),
          ]),
          metadata: { consent_token: 'consent-token-123' },
        }),
      );
    });
  });
});
