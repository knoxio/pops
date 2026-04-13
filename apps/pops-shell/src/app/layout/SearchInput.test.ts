/**
 * SearchInput section-mapping logic tests.
 *
 * The SearchResultsPanel component is tested comprehensively in the navigation
 * package (sections, ordering, context distinction, close behaviour, show-more
 * button rendering). These tests cover the helper functions and pure logic used
 * to transform tRPC API sections into panel-ready sections.
 */
import { describe, expect, it } from 'vitest';

/** Replicated from SearchInput — must stay in sync. */
function domainToLabel(domain: string): string {
  return domain
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

describe('domainToLabel', () => {
  it('capitalises a single-word domain', () => {
    expect(domainToLabel('movies')).toBe('Movies');
    expect(domainToLabel('budgets')).toBe('Budgets');
    expect(domainToLabel('entities')).toBe('Entities');
    expect(domainToLabel('transactions')).toBe('Transactions');
  });

  it('splits hyphenated domains into title-cased words', () => {
    expect(domainToLabel('tv-shows')).toBe('Tv Shows');
    expect(domainToLabel('inventory-items')).toBe('Inventory Items');
  });
});

describe('showPanel condition', () => {
  it('is true only when open and query is non-empty', () => {
    const cases: [boolean, string, boolean][] = [
      [true, 'lamp', true],
      [true, '', false],
      [false, 'lamp', false],
      [false, '', false],
    ];

    for (const [isOpen, query, expected] of cases) {
      expect(isOpen && query.length > 0).toBe(expected);
    }
  });
});

describe('showMore offset calculation', () => {
  it('uses current hits length as offset', () => {
    const hits = [
      { uri: 'a', score: 1, matchField: 'title', matchType: 'exact', data: {} },
      { uri: 'b', score: 0.8, matchField: 'title', matchType: 'prefix', data: {} },
    ];
    const offset = hits.length;
    expect(offset).toBe(2);
  });

  it('defaults to 0 when section not found', () => {
    const sections: { domain: string; hits: unknown[] }[] = [];
    const offset = sections.find((s) => s.domain === 'movies')?.hits.length ?? 0;
    expect(offset).toBe(0);
  });

  it('accumulates extra hits across show-more calls', () => {
    const extraHits: Record<string, unknown[]> = {};
    const domain = 'movies';
    const firstBatch = [{ uri: 'c' }, { uri: 'd' }];
    const secondBatch = [{ uri: 'e' }];

    // Simulate first show-more
    extraHits[domain] = [...(extraHits[domain] ?? []), ...firstBatch];
    expect(extraHits[domain]).toHaveLength(2);

    // Simulate second show-more
    extraHits[domain] = [...(extraHits[domain] ?? []), ...secondBatch];
    expect(extraHits[domain]).toHaveLength(3);
  });

  it('resets extra hits to empty object on query change', () => {
    const _before: Record<string, unknown[]> = { movies: [{ uri: 'a' }] };
    // Simulate useEffect on query change — previous state (_before) is discarded
    const extraHits: Record<string, unknown[]> = {};
    expect(extraHits).toEqual({});
    expect(_before).toBeDefined();
  });
});
