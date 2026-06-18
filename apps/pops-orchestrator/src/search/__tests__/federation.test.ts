import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetPillarRegistryCache } from '../../pillars/registry.js';
import {
  createFederationSource,
  resolveSearchPillars,
  SEARCH_PILLARS,
  type PillarSearchMeta,
  type SearchInvoker,
} from '../federation.js';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { SearchContext, SearchHit } from '../types.js';

const ROOT: SearchContext = { app: null, page: null };

function hit(uri: string, score = 0.5): SearchHit {
  return { uri, score, matchField: 'name', matchType: 'contains', data: {} };
}

function ok(hits: SearchHit[]): CallResult<{ hits: SearchHit[] }> {
  return { kind: 'ok', value: { hits } };
}

const ALL_PILLARS: { id: string; meta: PillarSearchMeta }[] = Object.entries(SEARCH_PILLARS).map(
  ([id, meta]) => ({ id, meta })
);

describe('createFederationSource', () => {
  it('fans the query out to every resolved pillar with the same envelope', async () => {
    const invoke = vi.fn<SearchInvoker>(async () => ok([]));
    const source = createFederationSource({ invoke, pillars: ALL_PILLARS });
    const query = { text: 'rent' };

    await source(query, ROOT);

    expect(invoke).toHaveBeenCalledTimes(3);
    for (const { id } of ALL_PILLARS) {
      expect(invoke).toHaveBeenCalledWith(id, { query, context: ROOT });
    }
  });

  it('decorates each pillar group with its ported domain/icon/color', async () => {
    const invoke: SearchInvoker = async (pillarId) => ok([hit(`pops:${pillarId}/1`)]);
    const source = createFederationSource({ invoke, pillars: ALL_PILLARS });

    const groups = await source({ text: 'x' }, ROOT);

    const byId = Object.fromEntries(groups.map((g) => [g.moduleId, g]));
    expect(byId['core']).toMatchObject({ domain: 'core', icon: 'Building2', color: 'green' });
    expect(byId['finance']).toMatchObject({
      domain: 'finance',
      icon: 'ArrowRightLeft',
      color: 'green',
    });
    expect(byId['inventory']).toMatchObject({
      domain: 'inventory',
      icon: 'Package',
      color: 'amber',
    });
  });

  it('collects every pillar hit unchanged into its group', async () => {
    const invoke: SearchInvoker = async (pillarId) =>
      ok([hit(`pops:${pillarId}/1`, 0.9), hit(`pops:${pillarId}/2`, 0.4)]);
    const source = createFederationSource({ invoke, pillars: ALL_PILLARS });

    const groups = await source({ text: 'x' }, ROOT);

    const finance = groups.find((g) => g.moduleId === 'finance')!;
    expect(finance.hits.map((h) => h.uri)).toEqual(['pops:finance/1', 'pops:finance/2']);
  });

  describe('best-effort failure isolation', () => {
    it('skips an unavailable pillar but keeps the others', async () => {
      const onWarn = vi.fn();
      const invoke: SearchInvoker = async (pillarId) => {
        if (pillarId === 'finance') return { kind: 'unavailable', pillar: 'finance' };
        return ok([hit(`pops:${pillarId}/1`)]);
      };
      const source = createFederationSource({ invoke, pillars: ALL_PILLARS, onWarn });

      const groups = await source({ text: 'x' }, ROOT);

      expect(groups.map((g) => g.moduleId).toSorted()).toEqual(['core', 'inventory']);
      expect(onWarn).toHaveBeenCalledWith(
        "[orchestrator] federated search pillar 'finance' unavailable",
        expect.objectContaining({ kind: 'unavailable' })
      );
    });

    it('skips a pillar whose call rejects, without sinking the whole search', async () => {
      const onWarn = vi.fn();
      const invoke: SearchInvoker = async (pillarId) => {
        if (pillarId === 'inventory') throw new Error('network down');
        return ok([hit(`pops:${pillarId}/1`)]);
      };
      const source = createFederationSource({ invoke, pillars: ALL_PILLARS, onWarn });

      const groups = await source({ text: 'x' }, ROOT);

      expect(groups.map((g) => g.moduleId).toSorted()).toEqual(['core', 'finance']);
      expect(onWarn).toHaveBeenCalledWith(
        '[orchestrator] federated search pillar threw',
        expect.any(Error)
      );
    });

    it('returns an empty group list when every pillar fails — never throws', async () => {
      const onWarn = vi.fn();
      const invoke: SearchInvoker = async () => {
        throw new Error('all down');
      };
      const source = createFederationSource({ invoke, pillars: ALL_PILLARS, onWarn });

      await expect(source({ text: 'x' }, ROOT)).resolves.toEqual([]);
      expect(onWarn).toHaveBeenCalledTimes(3);
    });
  });
});

describe('resolveSearchPillars', () => {
  const SELF = 'http://localhost:3009';
  const original = process.env['POPS_PILLARS'];

  beforeEach(() => {
    __resetPillarRegistryCache();
    delete process.env['POPS_PILLARS'];
  });

  afterEach(() => {
    __resetPillarRegistryCache();
    if (original === undefined) delete process.env['POPS_PILLARS'];
    else process.env['POPS_PILLARS'] = original;
  });

  it('intersects the search-capable constant with the registered pillars', () => {
    process.env['POPS_PILLARS'] =
      'finance:http://finance:3004,food:http://food:3005,inventory:http://inv:3002';
    __resetPillarRegistryCache();

    const resolved = resolveSearchPillars(SELF);

    // food is registered but not search-capable; core is search-capable but not registered.
    expect(resolved.map((p) => p.id).toSorted()).toEqual(['finance', 'inventory']);
  });

  it('returns no pillars when none of the registered pillars are search-capable', () => {
    process.env['POPS_PILLARS'] = 'food:http://food:3005';
    __resetPillarRegistryCache();

    expect(resolveSearchPillars(SELF)).toEqual([]);
  });
});
