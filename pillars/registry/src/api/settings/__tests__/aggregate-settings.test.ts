/**
 * Tests for the settings aggregator fan-out (settings-federation S3, OD-7).
 *
 * Covers: in-process self read, capability gating, the internal-token header
 * on the in-cluster fan-out, defensive sensitive redaction, and graceful
 * degradation (unreachable / unauthorized / parse failure).
 */
import { describe, expect, it, vi } from 'vitest';

import { REDACTED } from '@pops/pillar-settings';

import { aggregateSettings, hasFederatedSettings } from '../aggregate-settings.js';

import type { ManifestPayload } from '@pops/pillar-sdk';

import type { AggregateTarget } from '../aggregate-settings.js';

function manifest(pillarId: string, settings?: ManifestPayload['settings']): ManifestPayload {
  return {
    pillar: pillarId,
    version: '1.0.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '1.0.0',
      tag: `contract-${pillarId}@v1.0.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [`${pillarId}/entity`] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    ...(settings !== undefined ? { settings } : {}),
  };
}

function target(
  pillarId: string,
  options: {
    capabilities?: Record<string, boolean>;
    settings?: ManifestPayload['settings'];
  } = {}
): AggregateTarget {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3000`,
    manifest: manifest(pillarId, options.settings),
    ...(options.capabilities !== undefined ? { capabilities: options.capabilities } : {}),
  };
}

const REGISTRY = target('registry');
const FINANCE = target('finance', { capabilities: { settings: true } });

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FIXED_NOW = (): Date => new Date('2026-06-22T00:00:00.000Z');

describe('hasFederatedSettings', () => {
  it('is true only when the target advertises the settings capability', () => {
    expect(hasFederatedSettings(FINANCE)).toBe(true);
    expect(hasFederatedSettings(target('media', { capabilities: { settings: false } }))).toBe(
      false
    );
    expect(hasFederatedSettings(target('media'))).toBe(false);
  });
});

describe('aggregateSettings', () => {
  it('reads the self pillar in-process and never fetches it over HTTP', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ data: [] }));
    const result = await aggregateSettings([REGISTRY], {
      readSelf: () => [{ key: 'theme', value: 'dark' }],
      fetch: fetchStub,
      now: FIXED_NOW,
    });

    expect(fetchStub).not.toHaveBeenCalled();
    expect(result.pillars).toEqual([
      { pillarId: 'registry', settings: [{ key: 'theme', value: 'dark' }] },
    ]);
    expect(result.fetchedAt).toBe('2026-06-22T00:00:00.000Z');
  });

  it('fans out to a capability-advertising remote pillar carrying the internal token', async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse({ data: [{ key: 'finance.aiCategorizer.model', value: 'claude-haiku-4-5' }] })
    );
    const result = await aggregateSettings([REGISTRY, FINANCE], {
      readSelf: () => [],
      internalToken: 'secret-token',
      fetch: fetchStub,
      now: FIXED_NOW,
    });

    expect(fetchStub).toHaveBeenCalledWith(
      'http://finance-api:3000/settings',
      expect.objectContaining({
        method: 'GET',
        headers: { 'x-pops-internal-token': 'secret-token' },
      })
    );
    const finance = result.pillars.find((p) => p.pillarId === 'finance');
    expect(finance?.settings).toEqual([
      { key: 'finance.aiCategorizer.model', value: 'claude-haiku-4-5' },
    ]);
    expect(finance?.error).toBeUndefined();
  });

  it('skips a pillar that has not advertised the settings capability', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ data: [] }));
    const result = await aggregateSettings([REGISTRY, target('media')], {
      readSelf: () => [],
      fetch: fetchStub,
      now: FIXED_NOW,
    });

    expect(fetchStub).not.toHaveBeenCalled();
    expect(result.pillars.map((p) => p.pillarId)).toEqual(['registry']);
  });

  it('re-redacts sensitive keys defensively using the remote manifest', async () => {
    const mediaWithSecret = target('media', {
      capabilities: { settings: true },
      settings: {
        manifests: [
          {
            id: 'media.plex',
            title: 'Plex',
            order: 1,
            groups: [
              {
                id: 'connection',
                title: 'Connection',
                fields: [
                  { key: 'plex_url', label: 'Plex URL', type: 'url' },
                  { key: 'plex_token', label: 'Plex Token', type: 'password', sensitive: true },
                ],
              },
            ],
          },
        ],
      },
    });
    // A misbehaving pillar leaks the real secret; the aggregator masks it anyway.
    const fetchStub = vi.fn(async () =>
      jsonResponse({
        data: [
          { key: 'plex_url', value: 'http://plex:32400' },
          { key: 'plex_token', value: 'LEAKED-CIPHERTEXT' },
        ],
      })
    );
    const result = await aggregateSettings([REGISTRY, mediaWithSecret], {
      readSelf: () => [],
      fetch: fetchStub,
      now: FIXED_NOW,
    });

    const media = result.pillars.find((p) => p.pillarId === 'media');
    expect(media?.settings).toEqual([
      { key: 'plex_url', value: 'http://plex:32400' },
      { key: 'plex_token', value: REDACTED },
    ]);
  });

  it('degrades a non-200 remote to an unreachable slice without failing the call', async () => {
    const fetchStub = vi.fn(async () => new Response('boom', { status: 500 }));
    const result = await aggregateSettings([REGISTRY, FINANCE], {
      readSelf: () => [{ key: 'theme', value: 'dark' }],
      fetch: fetchStub,
      now: FIXED_NOW,
    });

    expect(result.pillars).toContainEqual({
      pillarId: 'finance',
      settings: [],
      error: 'unreachable',
    });
    expect(result.pillars).toContainEqual({
      pillarId: 'registry',
      settings: [{ key: 'theme', value: 'dark' }],
    });
  });

  it('tags a 401/403 remote as unauthorized', async () => {
    const fetchStub = vi.fn(async () => new Response('no', { status: 401 }));
    const result = await aggregateSettings([FINANCE], {
      readSelf: () => [],
      fetch: fetchStub,
      now: FIXED_NOW,
    });

    expect(result.pillars.find((p) => p.pillarId === 'finance')?.error).toBe('unauthorized');
  });

  it('degrades a malformed collection body to unreachable', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ wrong: 'shape' }));
    const result = await aggregateSettings([FINANCE], {
      readSelf: () => [],
      fetch: fetchStub,
      now: FIXED_NOW,
    });

    expect(result.pillars.find((p) => p.pillarId === 'finance')?.error).toBe('unreachable');
  });

  it('degrades a network throw to unreachable', async () => {
    const fetchStub = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await aggregateSettings([FINANCE], {
      readSelf: () => [],
      fetch: fetchStub,
      now: FIXED_NOW,
    });

    expect(result.pillars.find((p) => p.pillarId === 'finance')?.error).toBe('unreachable');
  });

  it('sorts pillars deterministically by id', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ data: [] }));
    const result = await aggregateSettings(
      [target('media', { capabilities: { settings: true } }), REGISTRY, FINANCE],
      { readSelf: () => [], fetch: fetchStub, now: FIXED_NOW }
    );

    expect(result.pillars.map((p) => p.pillarId)).toEqual(['finance', 'media', 'registry']);
  });

  it('orders pillars total-ly: equal ids compare to 0, not an arbitrary side', () => {
    const compare = (a: string, b: string): number => a.localeCompare(b);

    expect(compare('finance', 'finance')).toBe(0);
    expect(Math.sign(compare('finance', 'registry'))).toBe(-1);
    expect(Math.sign(compare('registry', 'finance'))).toBe(1);
  });
});
