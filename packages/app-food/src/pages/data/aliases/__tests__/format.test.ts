/**
 * Pure-function coverage for `format.ts` (PRD-122-C).
 *
 * The sort comparator + target label helpers are the only "business
 * logic" in the Aliases tab — keeping them unit-tested ensures the
 * RTL suite can stay focused on rendering + interaction.
 */
import { describe, expect, it } from 'vitest';

import { formatTargetLabel, formatTargetSlug, sortAliases } from '../format';

import type { AliasRow } from '../types';

function ingredientRow(overrides: Partial<AliasRow> = {}): AliasRow {
  return {
    id: 1,
    alias: 'platano',
    source: 'user',
    createdAt: '2026-06-01T00:00:00',
    target: { kind: 'ingredient', id: 10, slug: 'banana', name: 'Banana' },
    ...overrides,
  };
}

function variantRow(overrides: Partial<AliasRow> = {}): AliasRow {
  return {
    id: 2,
    alias: 'maduro',
    source: 'user',
    createdAt: '2026-06-02T00:00:00',
    target: {
      kind: 'variant',
      id: 100,
      slug: 'ripe',
      name: 'Ripe',
      parentIngredientSlug: 'banana',
      parentIngredientName: 'Banana',
    },
    ...overrides,
  };
}

describe('formatTargetLabel', () => {
  it('returns the ingredient name as-is', () => {
    expect(formatTargetLabel(ingredientRow().target)).toBe('Banana');
  });

  it('joins parent and variant name with an em-dash for variants', () => {
    expect(formatTargetLabel(variantRow().target)).toBe('Banana — Ripe');
  });
});

describe('formatTargetSlug', () => {
  it('returns the bare slug for ingredients', () => {
    expect(formatTargetSlug(ingredientRow().target)).toBe('banana');
  });

  it('joins parent and variant slugs with a colon for variants', () => {
    expect(formatTargetSlug(variantRow().target)).toBe('banana:ripe');
  });
});

describe('sortAliases', () => {
  const a = ingredientRow({ id: 1, alias: 'apple', source: 'user' });
  const b = ingredientRow({ id: 2, alias: 'Banana', source: 'llm' });
  const c = ingredientRow({ id: 3, alias: 'carrot', source: 'ingest' });

  it('sorts by alias case-insensitively (asc)', () => {
    expect(sortAliases([c, b, a], 'alias', 'asc').map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('inverts on desc', () => {
    expect(sortAliases([a, b, c], 'alias', 'desc').map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it('breaks ties by id so the table never reorders identical rows', () => {
    const duplicates = [
      ingredientRow({ id: 5, alias: 'tie' }),
      ingredientRow({ id: 3, alias: 'tie' }),
      ingredientRow({ id: 9, alias: 'tie' }),
    ];
    expect(sortAliases(duplicates, 'alias', 'asc').map((r) => r.id)).toEqual([3, 5, 9]);
  });

  it('sorts by source enum lexicographically', () => {
    expect(sortAliases([a, b, c], 'source', 'asc').map((r) => r.source)).toEqual([
      'ingest',
      'llm',
      'user',
    ]);
  });

  it('sorts by createdAt ISO string', () => {
    const oldest = ingredientRow({ id: 1, createdAt: '2026-01-01' });
    const newest = ingredientRow({ id: 2, createdAt: '2026-12-31' });
    expect(sortAliases([newest, oldest], 'createdAt', 'asc').map((r) => r.id)).toEqual([1, 2]);
  });

  it('sorts by target label so variants disambiguate via parent name', () => {
    const banana = ingredientRow({ id: 1, alias: 'a-platano' });
    const variant = variantRow({ id: 2, alias: 'b-maduro' });
    expect(sortAliases([variant, banana], 'target', 'asc').map((r) => r.id)).toEqual([1, 2]);
  });
});
