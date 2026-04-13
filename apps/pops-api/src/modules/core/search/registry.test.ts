import { beforeEach, describe, expect, it } from 'vitest';

import { getAdapters, registerSearchAdapter, resetRegistry } from './registry.js';
import type { Query, SearchAdapter, SearchContext, SearchHit } from './types.js';

function makeAdapter(domain: string): SearchAdapter {
  return {
    domain,
    icon: 'Search',
    color: 'gray',
    search(_query: Query, _context: SearchContext, _options?: { limit?: number }): SearchHit[] {
      return [];
    },
  };
}

beforeEach(() => {
  resetRegistry();
});

describe('registerSearchAdapter', () => {
  it('adds an adapter to the registry', () => {
    registerSearchAdapter(makeAdapter('movies'));
    const adapters = getAdapters();
    expect(adapters).toHaveLength(1);
    expect(adapters[0]?.domain).toBe('movies');
  });

  it('adds multiple adapters with distinct domains', () => {
    registerSearchAdapter(makeAdapter('movies'));
    registerSearchAdapter(makeAdapter('transactions'));
    registerSearchAdapter(makeAdapter('entities'));
    expect(getAdapters()).toHaveLength(3);
  });

  it('throws when registering a duplicate domain', () => {
    registerSearchAdapter(makeAdapter('movies'));
    expect(() => registerSearchAdapter(makeAdapter('movies'))).toThrow(
      'Search adapter for domain "movies" is already registered'
    );
  });

  it('does not add the duplicate adapter when registration fails', () => {
    registerSearchAdapter(makeAdapter('movies'));
    expect(() => registerSearchAdapter(makeAdapter('movies'))).toThrow();
    expect(getAdapters()).toHaveLength(1);
  });
});

describe('getAdapters', () => {
  it('returns an empty array when no adapters are registered', () => {
    expect(getAdapters()).toEqual([]);
  });

  it('returns all registered adapters', () => {
    const movies = makeAdapter('movies');
    const transactions = makeAdapter('transactions');
    registerSearchAdapter(movies);
    registerSearchAdapter(transactions);

    const result = getAdapters();
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.domain)).toEqual(['movies', 'transactions']);
  });

  it('returns a copy — mutating the result does not affect the registry', () => {
    registerSearchAdapter(makeAdapter('movies'));
    const first = getAdapters();
    first.push(makeAdapter('transactions'));
    expect(getAdapters()).toHaveLength(1);
  });
});

describe('adapter search', () => {
  it('calls search on a retrieved adapter with query and context', () => {
    const hits: SearchHit<{ title: string }>[] = [
      {
        uri: '/movies/1',
        score: 1.0,
        matchField: 'title',
        matchType: 'exact',
        data: { title: 'Inception' },
      },
    ];
    const adapter: SearchAdapter<{ title: string }> = {
      domain: 'movies',
      icon: 'Film',
      color: 'purple',
      search: () => hits,
    };
    registerSearchAdapter(adapter);

    const retrieved = getAdapters()[0];
    expect(retrieved).toBeDefined();
    const result = retrieved!.search({ text: 'inception' }, { app: 'media', page: 'search' });
    expect(result).toEqual(hits);
  });

  it('supports async adapters', async () => {
    const asyncAdapter: SearchAdapter<{ name: string }> = {
      domain: 'entities',
      icon: 'Building',
      color: 'blue',
      search: async () => [
        {
          uri: '/entities/1',
          score: 0.9,
          matchField: 'name',
          matchType: 'prefix',
          data: { name: 'Woolworths' },
        },
      ],
    };
    registerSearchAdapter(asyncAdapter);

    const retrieved = getAdapters()[0];
    expect(retrieved).toBeDefined();
    const result = await retrieved!.search({ text: 'wool' }, { app: 'finance', page: 'entities' });
    expect(result).toHaveLength(1);
    expect(result[0]?.uri).toBe('/entities/1');
  });

  it('typed adapter undergoes type erasure in registry', () => {
    const typedAdapter: SearchAdapter<{ amount: number }> = {
      domain: 'transactions',
      icon: 'DollarSign',
      color: 'green',
      search: () => [
        {
          uri: '/txn/42',
          score: 0.8,
          matchField: 'description',
          matchType: 'contains',
          data: { amount: 42.5 },
        },
      ],
    };
    // SearchAdapter<{ amount: number }> is assignable to SearchAdapter (SearchAdapter<unknown>)
    registerSearchAdapter(typedAdapter);

    // Registry returns SearchAdapter<unknown> — data is unknown
    const retrieved = getAdapters()[0];
    expect(retrieved).toBeDefined();
    expect(retrieved!.domain).toBe('transactions');
    const result = retrieved!.search({ text: 'coffee' }, { app: null, page: null });
    expect(Array.isArray(result)).toBe(true);
  });
});
