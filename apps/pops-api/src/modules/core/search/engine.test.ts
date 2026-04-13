import { beforeEach, describe, expect, it, vi } from 'vitest';

import { searchAll, showMore } from './engine.js';
import { registerSearchAdapter, resetRegistry } from './registry.js';
import type { Query, SearchAdapter, SearchContext, SearchHit } from './types.js';

const defaultContext: SearchContext = { app: 'media', page: 'search' };

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

function makeFailingAdapter(domain: string): SearchAdapter {
  return {
    domain,
    icon: 'Circle',
    color: 'gray',
    search: vi.fn().mockRejectedValue(new Error(`${domain} adapter failed`)),
  };
}

beforeEach(() => {
  resetRegistry();
});

describe('searchAll', () => {
  it('returns empty sections when no adapters registered', async () => {
    const result = await searchAll({ text: 'test' }, defaultContext);
    expect(result.sections).toEqual([]);
  });

  it('fans query to all registered adapters', async () => {
    const adapter1 = makeAdapter('movies', [makeHit({ uri: 'pops:media/movie/1' })]);
    const adapter2 = makeAdapter('tv-shows', [makeHit({ uri: 'pops:media/tv-show/1' })]);
    registerSearchAdapter(adapter1);
    registerSearchAdapter(adapter2);

    const query: Query = { text: 'test' };
    await searchAll(query, defaultContext);

    expect(adapter1.search).toHaveBeenCalledWith(query, defaultContext);
    expect(adapter2.search).toHaveBeenCalledWith(query, defaultContext);
  });

  it('returns sections for each adapter with results', async () => {
    registerSearchAdapter(makeAdapter('movies', [makeHit()], { icon: 'Film', color: 'purple' }));
    registerSearchAdapter(makeAdapter('tv-shows', [makeHit()], { icon: 'Tv', color: 'purple' }));

    const result = await searchAll({ text: 'test' }, defaultContext);
    expect(result.sections).toHaveLength(2);
    expect(result.sections.map((s) => s.domain)).toContain('movies');
    expect(result.sections.map((s) => s.domain)).toContain('tv-shows');
  });

  it('omits sections with no results', async () => {
    registerSearchAdapter(makeAdapter('movies', [makeHit()]));
    registerSearchAdapter(makeAdapter('tv-shows', []));

    const result = await searchAll({ text: 'test' }, defaultContext);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.domain).toBe('movies');
  });

  it('includes correct section metadata', async () => {
    registerSearchAdapter(makeAdapter('movies', [makeHit()], { icon: 'Film', color: 'purple' }));

    const result = await searchAll({ text: 'test' }, defaultContext);
    const section = result.sections[0]!;
    expect(section.domain).toBe('movies');
    expect(section.icon).toBe('Film');
    expect(section.color).toBe('purple');
  });

  describe('failure isolation', () => {
    it('omits failed adapter and returns others', async () => {
      registerSearchAdapter(makeFailingAdapter('movies'));
      registerSearchAdapter(makeAdapter('tv-shows', [makeHit()]));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await searchAll({ text: 'test' }, defaultContext);
      warnSpy.mockRestore();

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0]!.domain).toBe('tv-shows');
    });

    it('logs warning for failed adapter', async () => {
      registerSearchAdapter(makeFailingAdapter('movies'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await searchAll({ text: 'test' }, defaultContext);

      expect(warnSpy).toHaveBeenCalledWith('Search adapter failed:', expect.any(Error));
      warnSpy.mockRestore();
    });
  });

  describe('context ordering', () => {
    it('marks context sections with isContextSection=true', async () => {
      registerSearchAdapter(makeAdapter('movies', [makeHit()]));
      registerSearchAdapter(makeAdapter('transactions', [makeHit()]));

      const result = await searchAll({ text: 'test' }, { app: 'media', page: 'search' });
      const moviesSection = result.sections.find((s) => s.domain === 'movies')!;
      const txSection = result.sections.find((s) => s.domain === 'transactions')!;

      expect(moviesSection.isContextSection).toBe(true);
      expect(txSection.isContextSection).toBe(false);
    });

    it('sorts context sections before non-context sections', async () => {
      registerSearchAdapter(makeAdapter('transactions', [makeHit({ score: 1.0 })]));
      registerSearchAdapter(makeAdapter('movies', [makeHit({ score: 0.5 })]));

      const result = await searchAll({ text: 'test' }, { app: 'media', page: 'search' });
      expect(result.sections[0]!.domain).toBe('movies');
      expect(result.sections[0]!.isContextSection).toBe(true);
      expect(result.sections[1]!.domain).toBe('transactions');
      expect(result.sections[1]!.isContextSection).toBe(false);
    });

    it('sorts non-context sections by highest score descending', async () => {
      registerSearchAdapter(makeAdapter('transactions', [makeHit({ score: 0.5 })]));
      registerSearchAdapter(makeAdapter('budgets', [makeHit({ score: 0.8 })]));

      const result = await searchAll({ text: 'test' }, { app: 'media', page: 'search' });
      // Both are non-context (app is "media"), sorted by score
      expect(result.sections[0]!.domain).toBe('budgets');
      expect(result.sections[1]!.domain).toBe('transactions');
    });

    it('handles null app context gracefully', async () => {
      registerSearchAdapter(makeAdapter('movies', [makeHit()]));

      const result = await searchAll({ text: 'test' }, { app: null, page: null });
      expect(result.sections[0]!.isContextSection).toBe(false);
    });
  });

  describe('section limiting', () => {
    it('limits hits to 5 per section', async () => {
      const hits = Array.from({ length: 10 }, (_, i) =>
        makeHit({ uri: `pops:test/${i}`, score: 1.0 - i * 0.05 })
      );
      registerSearchAdapter(makeAdapter('movies', hits));

      const result = await searchAll({ text: 'test' }, defaultContext);
      expect(result.sections[0]!.hits).toHaveLength(5);
    });

    it('includes totalCount with full count', async () => {
      const hits = Array.from({ length: 10 }, (_, i) => makeHit({ uri: `pops:test/${i}` }));
      registerSearchAdapter(makeAdapter('movies', hits));

      const result = await searchAll({ text: 'test' }, defaultContext);
      expect(result.sections[0]!.totalCount).toBe(10);
      expect(result.sections[0]!.hits).toHaveLength(5);
    });

    it('sorts hits within section by score descending', async () => {
      const hits = [
        makeHit({ uri: 'pops:test/1', score: 0.5 }),
        makeHit({ uri: 'pops:test/2', score: 1.0 }),
        makeHit({ uri: 'pops:test/3', score: 0.8 }),
      ];
      registerSearchAdapter(makeAdapter('movies', hits));

      const result = await searchAll({ text: 'test' }, defaultContext);
      const sectionHits = result.sections[0]!.hits;
      expect(sectionHits[0]!.score).toBe(1.0);
      expect(sectionHits[1]!.score).toBe(0.8);
      expect(sectionHits[2]!.score).toBe(0.5);
    });
  });
});

describe('showMore', () => {
  it('returns paginated hits for a single domain', async () => {
    const hits = Array.from({ length: 10 }, (_, i) =>
      makeHit({ uri: `pops:test/${i}`, score: 1.0 - i * 0.05 })
    );
    registerSearchAdapter(makeAdapter('movies', hits));

    const result = await showMore('movies', { text: 'test' }, defaultContext, 0, 5);
    expect(result.hits).toHaveLength(5);
    expect(result.totalCount).toBe(10);
  });

  it('respects offset parameter', async () => {
    const hits = Array.from({ length: 10 }, (_, i) =>
      makeHit({ uri: `pops:test/${i}`, score: 1.0 - i * 0.05 })
    );
    registerSearchAdapter(makeAdapter('movies', hits));

    const result = await showMore('movies', { text: 'test' }, defaultContext, 5, 5);
    expect(result.hits).toHaveLength(5);
    expect(result.hits[0]!.uri).toBe('pops:test/5');
  });

  it('returns remaining hits when offset + limit exceeds total', async () => {
    const hits = Array.from({ length: 7 }, (_, i) =>
      makeHit({ uri: `pops:test/${i}`, score: 1.0 - i * 0.05 })
    );
    registerSearchAdapter(makeAdapter('movies', hits));

    const result = await showMore('movies', { text: 'test' }, defaultContext, 5, 5);
    expect(result.hits).toHaveLength(2);
    expect(result.totalCount).toBe(7);
  });

  it('throws for unknown domain', async () => {
    await expect(showMore('unknown', { text: 'test' }, defaultContext, 0)).rejects.toThrow(
      'No search adapter registered for domain "unknown"'
    );
  });

  it('sorts hits by score descending', async () => {
    const hits = [
      makeHit({ uri: 'pops:test/1', score: 0.3 }),
      makeHit({ uri: 'pops:test/2', score: 0.9 }),
      makeHit({ uri: 'pops:test/3', score: 0.6 }),
    ];
    registerSearchAdapter(makeAdapter('movies', hits));

    const result = await showMore('movies', { text: 'test' }, defaultContext, 0, 10);
    expect(result.hits[0]!.score).toBe(0.9);
    expect(result.hits[1]!.score).toBe(0.6);
    expect(result.hits[2]!.score).toBe(0.3);
  });

  it('defaults to limit of 5', async () => {
    const hits = Array.from({ length: 10 }, (_, i) =>
      makeHit({ uri: `pops:test/${i}`, score: 1.0 - i * 0.05 })
    );
    registerSearchAdapter(makeAdapter('movies', hits));

    const result = await showMore('movies', { text: 'test' }, defaultContext, 0);
    expect(result.hits).toHaveLength(5);
  });

  it('returns empty hits when offset is beyond total', async () => {
    const hits = [makeHit({ uri: 'pops:test/1' })];
    registerSearchAdapter(makeAdapter('movies', hits));

    const result = await showMore('movies', { text: 'test' }, defaultContext, 10);
    expect(result.hits).toHaveLength(0);
    expect(result.totalCount).toBe(1);
  });

  it('only queries the specified domain adapter', async () => {
    const moviesAdapter = makeAdapter('movies', [makeHit()]);
    const tvAdapter = makeAdapter('tv-shows', [makeHit()]);
    registerSearchAdapter(moviesAdapter);
    registerSearchAdapter(tvAdapter);

    await showMore('movies', { text: 'test' }, defaultContext, 0);
    expect(moviesAdapter.search).toHaveBeenCalled();
    expect(tvAdapter.search).not.toHaveBeenCalled();
  });
});
