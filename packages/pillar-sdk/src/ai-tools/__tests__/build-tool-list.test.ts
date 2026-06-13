import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pillar } from '../../discovery/__tests__/fixtures.js';
import {
  __resetBuildToolListInternals,
  __setBuildToolListInternals,
  buildToolList,
  invalidateToolListCache,
  TOOL_LIST_CACHE_TTL_MS,
} from '../build-tool-list.js';

import type { PillarSnapshot, PillarStatus, RegistrySnapshot } from '../../discovery/index.js';
import type { ManifestPayload } from '../../manifest-schema/index.js';

type ToolDescriptor = ManifestPayload['ai']['tools'][number];

function withTools(p: PillarSnapshot, tools: readonly ToolDescriptor[]): PillarSnapshot {
  return { ...p, manifest: { ...p.manifest, ai: { tools: [...tools] } } };
}

function withStatus(p: PillarSnapshot, status: PillarStatus): PillarSnapshot {
  return { ...p, status, registered: status === 'healthy' };
}

function snapshot(pillars: readonly PillarSnapshot[], fetchedAt = new Date(1)): RegistrySnapshot {
  return {
    pillars: [...pillars],
    fetchedAt,
    ttlMs: 30_000,
    source: 'fresh',
  };
}

function makeTool(name: string, description: string): ToolDescriptor {
  return {
    name,
    description: description.padEnd(15, '.'),
    parameters: { type: 'object' },
  };
}

describe('buildToolList', () => {
  let currentNow = 1_700_000_000_000;
  let currentSnapshot: RegistrySnapshot;
  let fetchCalls = 0;

  beforeEach(() => {
    currentNow = 1_700_000_000_000;
    fetchCalls = 0;
    currentSnapshot = snapshot([]);
    __setBuildToolListInternals({
      now: () => currentNow,
      fetchSnapshot: async () => {
        fetchCalls += 1;
        return currentSnapshot;
      },
    });
  });

  afterEach(() => {
    __resetBuildToolListInternals();
  });

  it('flattens ai.tools across registered healthy pillars', async () => {
    const finance = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [
        makeTool('createTransaction', 'create a transaction'),
        makeTool('listBudgets', 'list active budgets'),
      ]),
      'healthy'
    );
    const media = withStatus(
      withTools(pillar('media', 'http://media:3005'), [makeTool('searchMovies', 'find a movie')]),
      'healthy'
    );
    currentSnapshot = snapshot([finance, media]);

    const tools = await buildToolList();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual(['createTransaction', 'listBudgets', 'searchMovies']);
    expect(tools[0]).toMatchObject({ pillar: 'finance', pillarStatus: 'healthy' });
    expect(tools[2]).toMatchObject({ pillar: 'media', pillarStatus: 'healthy' });
  });

  it('excludes unavailable pillars by default and includes them with includeUnavailable', async () => {
    const healthy = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [
        makeTool('createTransaction', 'create'),
      ]),
      'healthy'
    );
    const down = withStatus(
      withTools(pillar('media', 'http://media:3005'), [makeTool('searchMovies', 'find a movie')]),
      'unavailable'
    );
    currentSnapshot = snapshot([healthy, down]);

    const defaultList = await buildToolList();
    expect(defaultList.map((t) => t.pillar)).toEqual(['finance']);

    const diagnostic = await buildToolList({ includeUnavailable: true });
    expect(diagnostic).toHaveLength(2);
    const mediaEntry = diagnostic.find((t) => t.pillar === 'media');
    expect(mediaEntry?.pillarStatus).toBe('unavailable');
  });

  it('treats unknown-status pillars as unhealthy by default', async () => {
    const cold = withStatus(
      withTools(pillar('food', 'http://food:3006'), [makeTool('addRecipe', 'save a recipe')]),
      'unknown'
    );
    currentSnapshot = snapshot([cold]);

    expect(await buildToolList()).toHaveLength(0);
    expect(await buildToolList({ includeUnavailable: true })).toHaveLength(1);
  });

  it('treats registered=false as unavailable even when status is "healthy"', async () => {
    const reconciling: PillarSnapshot = {
      ...withTools(pillar('media', 'http://media:3005'), [makeTool('searchMovies', 'find')]),
      status: 'healthy',
      registered: false,
    };
    currentSnapshot = snapshot([reconciling]);

    expect(await buildToolList()).toEqual([]);

    const diagnostic = await buildToolList({ includeUnavailable: true });
    expect(diagnostic).toHaveLength(1);
    expect(diagnostic[0]).toMatchObject({ pillar: 'media', pillarStatus: 'unavailable' });
  });

  it('falls back to the registered flag when status is missing', async () => {
    const legacyHealthy: PillarSnapshot = {
      ...withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'go')]),
      registered: true,
    };
    delete legacyHealthy.status;
    const legacyDown: PillarSnapshot = {
      ...withTools(pillar('media', 'http://media:3005'), [makeTool('searchMovies', 'go')]),
      registered: false,
    };
    delete legacyDown.status;
    currentSnapshot = snapshot([legacyHealthy, legacyDown]);

    const tools = await buildToolList();
    expect(tools.map((t) => t.pillar)).toEqual(['finance']);
  });

  it('restricts to the requested pillars when opts.pillars is set', async () => {
    const finance = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'a')]),
      'healthy'
    );
    const media = withStatus(
      withTools(pillar('media', 'http://media:3005'), [makeTool('searchMovies', 'a')]),
      'healthy'
    );
    currentSnapshot = snapshot([finance, media]);

    const tools = await buildToolList({ pillars: ['media'] });
    expect(tools.map((t) => t.pillar)).toEqual(['media']);
  });

  it('silently excludes pillars that declare no tools', async () => {
    const empty = withStatus(withTools(pillar('inventory', 'http://inv:3007'), []), 'healthy');
    const full = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'a')]),
      'healthy'
    );
    currentSnapshot = snapshot([empty, full]);

    const tools = await buildToolList();
    expect(tools.map((t) => t.pillar)).toEqual(['finance']);
  });

  it('returns an empty list when every pillar is down', async () => {
    const a = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'a')]),
      'unavailable'
    );
    currentSnapshot = snapshot([a]);
    expect(await buildToolList()).toEqual([]);
  });

  it('memoises identical requests inside the TTL window', async () => {
    const fin = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'a')]),
      'healthy'
    );
    currentSnapshot = snapshot([fin]);

    await buildToolList();
    await buildToolList();
    expect(fetchCalls).toBe(2);

    // The cache short-circuits the projection but still consults discovery
    // for the snapshot — verifying memoisation by checking we returned the
    // same reference.
    const a = await buildToolList();
    const b = await buildToolList();
    expect(a).toBe(b);
  });

  it('invalidates the memo when the snapshot fetchedAt advances', async () => {
    const fin = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'a')]),
      'healthy'
    );
    currentSnapshot = snapshot([fin], new Date(1));
    const first = await buildToolList();

    currentSnapshot = snapshot([fin], new Date(2));
    const second = await buildToolList();

    expect(first).not.toBe(second);
    expect(second.map((t) => t.name)).toEqual(['createTransaction']);
  });

  it('invalidates the memo after the 30s TTL elapses even if discovery is sticky', async () => {
    const fin = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'a')]),
      'healthy'
    );
    currentSnapshot = snapshot([fin], new Date(42));

    const first = await buildToolList();
    currentNow += TOOL_LIST_CACHE_TTL_MS + 1;
    const second = await buildToolList();
    expect(first).not.toBe(second);
  });

  it('keys the cache by request options', async () => {
    const fin = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'a')]),
      'healthy'
    );
    const down = withStatus(
      withTools(pillar('media', 'http://media:3005'), [makeTool('searchMovies', 'a')]),
      'unavailable'
    );
    currentSnapshot = snapshot([fin, down]);

    const withoutDiag = await buildToolList();
    const withDiag = await buildToolList({ includeUnavailable: true });
    expect(withoutDiag.map((t) => t.pillar)).toEqual(['finance']);
    expect(withDiag.map((t) => t.pillar).toSorted()).toEqual(['finance', 'media']);
  });

  it('invalidateToolListCache forces a rebuild', async () => {
    const fin = withStatus(
      withTools(pillar('finance', 'http://finance:3004'), [makeTool('createTransaction', 'a')]),
      'healthy'
    );
    currentSnapshot = snapshot([fin]);
    const first = await buildToolList();
    invalidateToolListCache();
    const second = await buildToolList();
    expect(first).not.toBe(second);
  });
});
