/**
 * Tests for the cerebrum nudge dispatcher (PRD-092 US-07, PRD-084).
 *
 * The dispatcher now writes the alert nudge over the cerebrum pillar's
 * `POST /nudges` REST endpoint instead of inserting into the cerebrum DB. The
 * cerebrum nudge client is injected so these tests assert the exact POST
 * payload and the fail-soft contract (cerebrum absent / POST failure → log +
 * return false, never throw) without a live cerebrum-api.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createCerebrumNudgeHttpClient,
  resolveCerebrumBaseUrl,
  type CerebrumNudgeClient,
  type CreateNudgeBody,
} from './cerebrum-nudge-client.js';
import { dispatchNudge } from './nudge.js';

import type { FiredAlert } from '../types.js';

function buildAlert(over: Partial<FiredAlert> = {}): FiredAlert {
  return {
    id: 7,
    ruleId: 3,
    type: 'budget-threshold',
    message: 'Spend crossed the cap',
    severity: 'critical',
    scopeDetail: 'budget:global',
    metricValue: 120,
    thresholdValue: 100,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: '2026-06-18T00:00:00.000Z',
    ...over,
  };
}

function fakeClient(): { client: CerebrumNudgeClient; calls: CreateNudgeBody[] } {
  const calls: CreateNudgeBody[] = [];
  return {
    calls,
    client: {
      createNudge: (body) => {
        calls.push(body);
        return Promise.resolve({ id: 'nudge_20260618_0000_insight_abc123' });
      },
    },
  };
}

describe('dispatchNudge', () => {
  it('POSTs an insight nudge carrying the alert fields (critical → high)', async () => {
    const { client, calls } = fakeClient();
    const alert = buildAlert({ severity: 'critical', scopeDetail: 'budget:global' });

    const delivered = await dispatchNudge(alert, { nudgeClient: client });

    expect(delivered).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      type: 'insight',
      title: 'AI alert: budget-threshold',
      body: 'Spend crossed the cap (budget:global)',
      priority: 'high',
      engramIds: [],
    });
  });

  it('maps a warning alert to medium priority and omits the scope suffix when null', async () => {
    const { client, calls } = fakeClient();
    const alert = buildAlert({ severity: 'warning', scopeDetail: null, message: 'errors up' });

    await dispatchNudge(alert, { nudgeClient: client });

    expect(calls[0]).toMatchObject({ priority: 'medium', body: 'errors up' });
  });

  it('returns false (no throw) when cerebrum is not configured', async () => {
    const delivered = await dispatchNudge(buildAlert(), { nudgeClient: null });
    expect(delivered).toBe(false);
  });

  it('fails soft: a client error is logged and returns false', async () => {
    const client: CerebrumNudgeClient = {
      createNudge: () => Promise.reject(new Error('cerebrum POST /nudges → HTTP 503')),
    };
    const delivered = await dispatchNudge(buildAlert(), { nudgeClient: client });
    expect(delivered).toBe(false);
  });
});

describe('resolveCerebrumBaseUrl', () => {
  it('resolves the cerebrum origin from POPS_PILLARS', () => {
    const url = resolveCerebrumBaseUrl({
      POPS_PILLARS: 'food:http://food-api:3000,cerebrum:http://cerebrum-api:3007',
    });
    expect(url).toBe('http://cerebrum-api:3007');
  });

  it('returns null when cerebrum is absent', () => {
    expect(resolveCerebrumBaseUrl({ POPS_PILLARS: 'food:http://food-api:3000' })).toBeNull();
    expect(resolveCerebrumBaseUrl({})).toBeNull();
  });
});

describe('createCerebrumNudgeHttpClient', () => {
  it('POSTs /nudges with the JSON body and parses the created nudge', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ nudge: { id: 'nudge_1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = createCerebrumNudgeHttpClient('http://cerebrum-api:3007/', fetchImpl);

    const result = await client.createNudge({
      type: 'insight',
      title: 't',
      body: 'b',
      priority: 'high',
      engramIds: [],
    });

    expect(result).toEqual({ id: 'nudge_1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('http://cerebrum-api:3007/nudges');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({ type: 'insight', priority: 'high' });
  });

  it('throws on a non-2xx response', async () => {
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('nope', { status: 500 }));
    const client = createCerebrumNudgeHttpClient('http://cerebrum-api:3007', fetchImpl);

    await expect(client.createNudge({ title: 't', body: 'b', priority: 'low' })).rejects.toThrow(
      /HTTP 500/
    );
  });
});
