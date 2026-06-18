import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createOrchestratorApp } from '../app.js';

import type { PillarSearchGroup, SearchSource } from '../search/index.js';
import type { SearchHit } from '../search/types.js';

const SELF_BASE_URL = 'http://localhost:3009';

function hit(uri: string, score: number): SearchHit {
  return { uri, score, matchField: 'name', matchType: 'contains', data: {} };
}

function group(overrides: Partial<PillarSearchGroup> & { moduleId: string }): PillarSearchGroup {
  return {
    domain: overrides.domain ?? overrides.moduleId,
    moduleId: overrides.moduleId,
    icon: overrides.icon ?? 'Circle',
    color: overrides.color ?? 'gray',
    hits: overrides.hits ?? [],
  };
}

function makeApp(searchSource: SearchSource) {
  return createOrchestratorApp({ version: '1.2.3', selfBaseUrl: SELF_BASE_URL }, { searchSource });
}

describe('POST /search', () => {
  it('federates over the source and returns merged, ranked, decorated sections', async () => {
    const source: SearchSource = vi.fn(async () => [
      group({
        moduleId: 'finance',
        icon: 'ArrowRightLeft',
        color: 'green',
        hits: [hit('pops:finance/1', 0.4)],
      }),
      group({
        moduleId: 'inventory',
        icon: 'Package',
        color: 'amber',
        hits: [hit('pops:inventory/1', 0.9)],
      }),
    ]);

    const res = await request(makeApp(source))
      .post('/search')
      .send({ query: { text: 'drill' } });

    expect(res.status).toBe(200);
    expect(res.body.sections.map((s: { domain: string }) => s.domain)).toEqual([
      'inventory',
      'finance',
    ]);
    expect(res.body.sections[0]).toMatchObject({
      moduleId: 'inventory',
      icon: 'Package',
      color: 'amber',
      isContextSection: false,
      totalCount: 1,
    });
  });

  it('honours the request context for context-section ordering', async () => {
    const source: SearchSource = async () => [
      group({ moduleId: 'finance', hits: [hit('pops:finance/1', 0.9)] }),
      group({ moduleId: 'inventory', hits: [hit('pops:inventory/1', 0.3)] }),
    ];

    const res = await request(makeApp(source))
      .post('/search')
      .send({ query: { text: 'thing' }, context: { app: 'inventory', page: 'items' } });

    expect(res.status).toBe(200);
    expect(res.body.sections[0]).toMatchObject({ moduleId: 'inventory', isContextSection: true });
  });

  it('still returns the surviving pillars when the source drops a failing one', async () => {
    // The federation source absorbs per-pillar failures; the route sees only
    // the survivors. A source that yields a single group models "one pillar
    // down, the rest answered".
    const source: SearchSource = async () => [
      group({
        moduleId: 'core',
        icon: 'Building2',
        color: 'green',
        hits: [hit('pops:core/1', 0.7)],
      }),
    ];

    const res = await request(makeApp(source))
      .post('/search')
      .send({ query: { text: 'acme' } });

    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveLength(1);
    expect(res.body.sections[0].moduleId).toBe('core');
  });

  it('short-circuits a blank query without touching the source', async () => {
    const source = vi.fn<SearchSource>(async () => []);

    const res = await request(makeApp(source))
      .post('/search')
      .send({ query: { text: '   ' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sections: [] });
    expect(source).not.toHaveBeenCalled();
  });

  it('rejects a structurally invalid body with 400', async () => {
    const source = vi.fn<SearchSource>(async () => []);

    const res = await request(makeApp(source))
      .post('/search')
      .send({ query: { text: 42 } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(source).not.toHaveBeenCalled();
  });

  it('returns 500 when the source throws unexpectedly', async () => {
    const source: SearchSource = async () => {
      throw new Error('boom');
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(makeApp(source))
      .post('/search')
      .send({ query: { text: 'x' } });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('search_failed');
    errSpy.mockRestore();
  });
});
