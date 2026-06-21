import { describe, expect, it, vi } from 'vitest';

import { RegistryUnreachableError, type PillarSnapshot } from '@pops/pillar-sdk/discovery';

import {
  createFederationSource,
  sectionMetaFor,
  selectSearchPillars,
  SEARCH_SECTION_META,
  type SearchInvoker,
} from '../federation.js';

import type { CallResult } from '@pops/pillar-sdk/client';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import type { SearchContext, SearchHit } from '../types.js';

const ROOT: SearchContext = { app: null, page: null };

function hit(uri: string, score = 0.5): SearchHit {
  return { uri, score, matchField: 'name', matchType: 'contains', data: {} };
}

function ok(hits: SearchHit[]): CallResult<{ hits: SearchHit[] }> {
  return { kind: 'ok', value: { hits } };
}

/**
 * A search adapter descriptor passing manifest validation. The federation
 * source only inspects `manifest.search.adapters.length`, so the exact
 * adapter shape is incidental — but we keep it schema-valid so the fixtures
 * cannot lie about what a real pillar advertises.
 */
function searchAdapter(name: string): ManifestPayload['search']['adapters'][number] {
  return {
    name,
    entityType: `${name}-entity`,
    queryShape: {
      supportsText: true,
      supportsTags: false,
      supportsDateRange: false,
      supportsScope: [],
    },
    procedurePath: `${name}.search.search`,
  };
}

function manifestFor(
  pillarId: string,
  opts: { searchCapable: boolean } = { searchCapable: true }
): ManifestPayload {
  return {
    pillar: pillarId,
    version: '0.1.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '0.1.0',
      tag: `contract-${pillarId}@v0.1.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: opts.searchCapable ? [searchAdapter('entities')] : [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

function snapshot(
  pillarId: string,
  opts: {
    searchCapable?: boolean;
    registered?: boolean;
    status?: PillarSnapshot['status'];
  } = {}
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `http://${pillarId}:3000`,
    manifest: manifestFor(pillarId, { searchCapable: opts.searchCapable ?? true }),
    registered: opts.registered ?? true,
    lastSeenAt: new Date(),
    ...(opts.status !== undefined ? { status: opts.status } : { status: 'healthy' }),
  };
}

describe('selectSearchPillars — registry-driven membership', () => {
  it('selects only registered, healthy pillars that declare search.adapters', () => {
    const onWarn = vi.fn();
    const resolved = selectSearchPillars(
      [
        snapshot('core'),
        snapshot('finance'),
        snapshot('food', { searchCapable: false }),
        snapshot('inventory'),
      ],
      onWarn
    );

    expect(resolved.map((p) => p.id).toSorted()).toEqual(['core', 'finance', 'inventory']);
    expect(onWarn).not.toHaveBeenCalled();
  });

  it('drops an unregistered pillar even if it advertises search', () => {
    const resolved = selectSearchPillars([snapshot('finance', { registered: false })], vi.fn());
    expect(resolved).toEqual([]);
  });

  it('drops an unavailable or unknown pillar', () => {
    const resolved = selectSearchPillars(
      [
        snapshot('finance', { status: 'unavailable' }),
        snapshot('inventory', { status: 'unknown' }),
      ],
      vi.fn()
    );
    expect(resolved).toEqual([]);
  });

  it('treats a registered pillar with no explicit status as healthy (legacy snapshot)', () => {
    const legacy: PillarSnapshot = {
      pillarId: 'core',
      baseUrl: 'http://core:3000',
      manifest: manifestFor('core'),
      registered: true,
      lastSeenAt: new Date(),
    };
    const resolved = selectSearchPillars([legacy], vi.fn());
    expect(resolved.map((p) => p.id)).toEqual(['core']);
  });

  it('decorates a known pillar with its ported section chrome', () => {
    const resolved = selectSearchPillars([snapshot('finance')], vi.fn());
    expect(resolved[0]?.meta).toEqual(SEARCH_SECTION_META['finance']);
  });

  it('federates a search-capable pillar with no static chrome, defaulting its decoration', () => {
    const resolved = selectSearchPillars([snapshot('media')], vi.fn());
    expect(resolved.map((p) => p.id)).toEqual(['media']);
    expect(resolved[0]?.meta).toEqual({ domain: 'media', icon: 'Circle', color: 'gray' });
  });
});

describe('sectionMetaFor', () => {
  it('returns the static entry for a mapped pillar', () => {
    expect(sectionMetaFor('core')).toEqual({ domain: 'core', icon: 'Building2', color: 'green' });
  });

  it('keys the default domain to the pillar id for an unmapped pillar', () => {
    expect(sectionMetaFor('photos')).toEqual({ domain: 'photos', icon: 'Circle', color: 'gray' });
  });
});

describe('createFederationSource', () => {
  function sourceFor(
    snapshots: readonly PillarSnapshot[],
    invoke: SearchInvoker,
    onWarn = vi.fn()
  ) {
    return createFederationSource({ invoke, snapshotReader: async () => snapshots, onWarn });
  }

  it('fans the query out to every registry-resolved search-capable pillar', async () => {
    const invoke = vi.fn<SearchInvoker>(async () => ok([]));
    const source = sourceFor(
      [snapshot('core'), snapshot('finance'), snapshot('inventory')],
      invoke
    );
    const query = { text: 'rent' };

    await source(query, ROOT);

    expect(invoke).toHaveBeenCalledTimes(3);
    for (const id of ['core', 'finance', 'inventory']) {
      expect(invoke).toHaveBeenCalledWith(id, { query, context: ROOT });
    }
  });

  it('does NOT federate a registered pillar that lacks the search capability', async () => {
    const invoke = vi.fn<SearchInvoker>(async () => ok([hit('pops:x/1')]));
    const source = sourceFor(
      [snapshot('finance'), snapshot('food', { searchCapable: false })],
      invoke
    );

    const groups = await source({ text: 'x' }, ROOT);

    expect(groups.map((g) => g.moduleId)).toEqual(['finance']);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('finance', expect.anything());
  });

  it('decorates each pillar group with its ported domain/icon/color', async () => {
    const invoke: SearchInvoker = async (pillarId) => ok([hit(`pops:${pillarId}/1`)]);
    const source = sourceFor(
      [snapshot('core'), snapshot('finance'), snapshot('inventory')],
      invoke
    );

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
    const source = sourceFor([snapshot('finance')], invoke);

    const groups = await source({ text: 'x' }, ROOT);

    const finance = groups.find((g) => g.moduleId === 'finance')!;
    expect(finance.hits.map((h) => h.uri)).toEqual(['pops:finance/1', 'pops:finance/2']);
  });

  describe('best-effort failure isolation', () => {
    const ALL = [snapshot('core'), snapshot('finance'), snapshot('inventory')];

    it('skips an unavailable pillar but keeps the others', async () => {
      const onWarn = vi.fn();
      const invoke: SearchInvoker = async (pillarId) => {
        if (pillarId === 'finance') return { kind: 'unavailable', pillar: 'finance' };
        return ok([hit(`pops:${pillarId}/1`)]);
      };
      const source = sourceFor(ALL, invoke, onWarn);

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
      const source = sourceFor(ALL, invoke, onWarn);

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
      const source = sourceFor(ALL, invoke, onWarn);

      await expect(source({ text: 'x' }, ROOT)).resolves.toEqual([]);
      expect(onWarn).toHaveBeenCalledTimes(3);
    });
  });

  describe('registry resilience', () => {
    it('degrades to an empty federation when the registry is unreachable', async () => {
      const onWarn = vi.fn();
      const invoke = vi.fn<SearchInvoker>(async () => ok([hit('pops:x/1')]));
      const source = createFederationSource({
        invoke,
        snapshotReader: async () => {
          throw new RegistryUnreachableError('down', { attempts: 1 });
        },
        onWarn,
      });

      await expect(source({ text: 'x' }, ROOT)).resolves.toEqual([]);
      expect(invoke).not.toHaveBeenCalled();
      expect(onWarn).toHaveBeenCalledWith(
        '[orchestrator] registry unreachable; serving empty federated-search set',
        expect.any(RegistryUnreachableError)
      );
    });

    it('degrades to an empty federation when the registry read throws any error', async () => {
      const onWarn = vi.fn();
      const invoke = vi.fn<SearchInvoker>(async () => ok([hit('pops:x/1')]));
      const source = createFederationSource({
        invoke,
        snapshotReader: async () => {
          throw new Error('schema validation boom');
        },
        onWarn,
      });

      await expect(source({ text: 'x' }, ROOT)).resolves.toEqual([]);
      expect(invoke).not.toHaveBeenCalled();
      expect(onWarn).toHaveBeenCalledWith(
        '[orchestrator] registry read failed; serving empty federated-search set',
        expect.any(Error)
      );
    });

    it('re-resolves membership per search so a newly registered pillar appears', async () => {
      const invoke = vi.fn<SearchInvoker>(async () => ok([hit('pops:x/1')]));
      let snapshots: PillarSnapshot[] = [snapshot('finance')];
      const source = createFederationSource({
        invoke,
        snapshotReader: async () => snapshots,
      });

      const first = await source({ text: 'x' }, ROOT);
      expect(first.map((g) => g.moduleId)).toEqual(['finance']);

      snapshots = [snapshot('finance'), snapshot('inventory')];
      const second = await source({ text: 'x' }, ROOT);
      expect(second.map((g) => g.moduleId).toSorted()).toEqual(['finance', 'inventory']);
    });
  });
});
