/**
 * Unit tests for the flat-rows → tree conversion.
 */
import { describe, expect, it } from 'vitest';

import { buildIngredientTree } from '../buildIngredientTree';

import type { IngredientRow } from '../ingredient-wire-types.js';

function row(overrides: Partial<IngredientRow> & { id: number; slug: string }): IngredientRow {
  return {
    id: overrides.id,
    parentId: overrides.parentId ?? null,
    name: overrides.name ?? overrides.slug,
    slug: overrides.slug,
    defaultUnit: overrides.defaultUnit ?? 'count',
    densityGPerMl: overrides.densityGPerMl ?? null,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? '2026-01-01',
  };
}

describe('buildIngredientTree', () => {
  it('groups children under their declared parent and sorts them by slug', () => {
    // Input intentionally unsorted to prove the function enforces order.
    const tree = buildIngredientTree([
      row({ id: 1, slug: 'fruit' }),
      row({ id: 2, slug: 'banana', parentId: 1 }),
      row({ id: 3, slug: 'apple', parentId: 1 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.row.slug).toBe('fruit');
    expect(tree[0]?.children.map((c) => c.row.slug)).toEqual(['apple', 'banana']);
  });

  it('sorts root-level rows by slug regardless of input order', () => {
    const tree = buildIngredientTree([
      row({ id: 1, slug: 'vegetable' }),
      row({ id: 2, slug: 'fruit' }),
    ]);
    expect(tree.map((n) => n.row.slug)).toEqual(['fruit', 'vegetable']);
  });

  it('re-roots orphans whose parent is not in the list', () => {
    const tree = buildIngredientTree([row({ id: 2, slug: 'banana', parentId: 999 })]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.row.slug).toBe('banana');
  });

  it('preserves multi-level depth', () => {
    const tree = buildIngredientTree([
      row({ id: 1, slug: 'fruit' }),
      row({ id: 2, slug: 'tropical', parentId: 1 }),
      row({ id: 3, slug: 'banana', parentId: 2 }),
    ]);
    expect(tree[0]?.children[0]?.children[0]?.row.slug).toBe('banana');
  });
});
