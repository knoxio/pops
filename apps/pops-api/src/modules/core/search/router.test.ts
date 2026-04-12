import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCaller } from '../../../shared/test-utils.js';
import { registerSearchAdapter, resetRegistry } from './registry.js';
import type { SearchAdapter, SearchHit } from './types.js';

function makeHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    uri: overrides.uri ?? 'pops:test/1',
    score: overrides.score ?? 0.5,
    matchField: overrides.matchField ?? 'name',
    matchType: overrides.matchType ?? 'contains',
    data: overrides.data ?? {},
  };
}

function makeAdapter(
  domain: string,
  hits: SearchHit[] = [],
  overrides: Partial<SearchAdapter> = {}
): SearchAdapter {
  return {
    domain,
    icon: overrides.icon ?? 'Circle',
    color: overrides.color ?? 'gray',
    search: vi.fn().mockResolvedValue(hits),
  };
}

let caller: ReturnType<typeof createCaller>;

beforeEach(() => {
  resetRegistry();
  caller = createCaller();
});

describe('core.search.query', () => {
  it('returns sections from registered adapters', async () => {
    registerSearchAdapter(
      makeAdapter('movies', [makeHit({ uri: 'pops:media/movie/1', score: 0.8 })], {
        icon: 'Film',
        color: 'purple',
      })
    );

    const result = await caller.core.search.query({
      text: 'test',
      context: { app: 'media', page: 'search' },
    });

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.domain).toBe('movies');
    expect(result.sections[0]!.icon).toBe('Film');
    expect(result.sections[0]!.color).toBe('purple');
    expect(result.sections[0]!.hits).toHaveLength(1);
  });

  it('returns empty sections when no adapters match', async () => {
    registerSearchAdapter(makeAdapter('movies', []));

    const result = await caller.core.search.query({
      text: 'nonexistent',
    });

    expect(result.sections).toEqual([]);
  });

  it('works without explicit context', async () => {
    registerSearchAdapter(makeAdapter('movies', [makeHit()]));

    const result = await caller.core.search.query({ text: 'test' });

    expect(result.sections).toHaveLength(1);
  });

  it('requires auth', async () => {
    const unauthCaller = createCaller(false);

    await expect(unauthCaller.core.search.query({ text: 'test' })).rejects.toThrow(TRPCError);
    await expect(unauthCaller.core.search.query({ text: 'test' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('core.search.showMore', () => {
  it('returns paginated hits for a domain', async () => {
    const hits = Array.from({ length: 10 }, (_, i) =>
      makeHit({ uri: `pops:test/${i}`, score: 1.0 - i * 0.05 })
    );
    registerSearchAdapter(makeAdapter('movies', hits));

    const result = await caller.core.search.showMore({
      domain: 'movies',
      text: 'test',
      offset: 0,
    });

    expect(result.hits).toHaveLength(5);
    expect(result.totalCount).toBe(10);
  });

  it('respects offset parameter', async () => {
    const hits = Array.from({ length: 10 }, (_, i) =>
      makeHit({ uri: `pops:test/${i}`, score: 1.0 - i * 0.05 })
    );
    registerSearchAdapter(makeAdapter('movies', hits));

    const result = await caller.core.search.showMore({
      domain: 'movies',
      text: 'test',
      offset: 5,
    });

    expect(result.hits).toHaveLength(5);
    expect(result.hits[0]!.uri).toBe('pops:test/5');
  });

  it('throws for unknown domain', async () => {
    await expect(
      caller.core.search.showMore({
        domain: 'nonexistent',
        text: 'test',
        offset: 0,
      })
    ).rejects.toThrow();
  });

  it('requires auth', async () => {
    const unauthCaller = createCaller(false);

    await expect(
      unauthCaller.core.search.showMore({
        domain: 'movies',
        text: 'test',
        offset: 0,
      })
    ).rejects.toThrow(TRPCError);
  });
});
