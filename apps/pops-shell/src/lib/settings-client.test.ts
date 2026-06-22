/**
 * Tests for the capability-gated, per-pillar settings transport
 * (settings-federation S3). The load-bearing assertion is WHERE each pillar's
 * read/write routes: to `/<ownerPillar>-api/settings` when the pillar
 * advertises the live `settings` capability, else fall back to
 * `/core-api/settings`.
 */
import { describe, expect, it, vi } from 'vitest';

import { settingsBaseFor, settingsClientFor } from './settings-client';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('settingsBaseFor', () => {
  it('keeps the registry pillar on the historic /core-api prefix', () => {
    expect(settingsBaseFor('registry')).toBe('/core-api');
  });

  it('keeps the legacy core id on the historic /core-api prefix', () => {
    expect(settingsBaseFor('core')).toBe('/core-api');
  });

  it('routes every other pillar to its /<id>-api prefix', () => {
    expect(settingsBaseFor('finance')).toBe('/finance-api');
    expect(settingsBaseFor('media')).toBe('/media-api');
  });
});

describe('settingsClientFor — capability-gated routing', () => {
  it('routes a federated pillar to its own /<id>-api/settings surface', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => okJson({ settings: {} }));
    const client = settingsClientFor('finance', true, fetchStub);

    await client.getMany(['finance.aiCategorizer.model']);
    await client.setMany([{ key: 'finance.aiCategorizer.model', value: 'claude-haiku-4-5' }]);
    await client.reset(['finance.aiCategorizer.model']);

    expect(fetchStub.mock.calls.map((c) => c[0])).toEqual([
      '/finance-api/settings/get-many',
      '/finance-api/settings/set-many',
      '/finance-api/settings/reset',
    ]);
  });

  it('falls back to /core-api/settings when the pillar has NOT advertised the capability', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => okJson({ settings: {} }));
    const client = settingsClientFor('finance', false, fetchStub);

    await client.getMany(['finance.aiCategorizer.model']);
    await client.setMany([{ key: 'finance.aiCategorizer.model', value: 'x' }]);

    expect(fetchStub.mock.calls.map((c) => c[0])).toEqual([
      '/core-api/settings/get-many',
      '/core-api/settings/set-many',
    ]);
  });

  it('routes core to /core-api regardless of the capability flag', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => okJson({ settings: {} }));
    await settingsClientFor('core', true, fetchStub).getMany(['theme']);
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/core-api/settings/get-many');
  });

  it('sends a JSON body with the requested keys/entries', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () =>
      okJson({ settings: { plex_url: 'http://plex:32400' } })
    );
    const client = settingsClientFor('media', true, fetchStub);

    await client.getMany(['plex_url']);
    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ keys: ['plex_url'] });
  });

  it('parses the { settings } bulk response', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () =>
      okJson({ settings: { plex_url: 'http://plex:32400' } })
    );
    const result = await settingsClientFor('media', true, fetchStub).getMany(['plex_url']);
    expect(result.settings).toEqual({ plex_url: 'http://plex:32400' });
  });

  it('parses the { reset, settings } reset response', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () =>
      okJson({ reset: ['plex_url'], settings: { plex_url: 'http://default' } })
    );
    const result = await settingsClientFor('media', true, fetchStub).reset(['plex_url']);
    expect(result.reset).toEqual(['plex_url']);
    expect(result.settings).toEqual({ plex_url: 'http://default' });
  });

  it('sends an empty body for a reset-all (no keys)', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => okJson({ reset: [], settings: {} }));
    await settingsClientFor('media', true, fetchStub).reset();
    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it('throws a status-carrying error on a non-2xx response', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => new Response('nope', { status: 401 }));
    await expect(
      settingsClientFor('finance', true, fetchStub).getMany(['x'])
    ).rejects.toMatchObject({ status: 401 });
  });

  it('drops non-string values defensively from a malformed bulk response', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () =>
      okJson({ settings: { a: 'ok', b: 42, c: null } })
    );
    const result = await settingsClientFor('finance', true, fetchStub).getMany(['a', 'b', 'c']);
    expect(result.settings).toEqual({ a: 'ok' });
  });
});
