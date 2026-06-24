/**
 * Covers the pure `buildIngredientLookup` shape; the hook itself is
 * exercised end-to-end by the WeightsSection RTL suite.
 */
import { describe, expect, it } from 'vitest';

import { buildIngredientLookup } from '../useWeightRowViews';

describe('buildIngredientLookup', () => {
  it('indexes ingredients by id', () => {
    const lookup = buildIngredientLookup([
      { id: 1, name: 'Onion', slug: 'onion' },
      { id: 2, name: 'Egg', slug: 'egg' },
    ]);
    expect(lookup.byId.get(1)?.name).toBe('Onion');
    expect(lookup.byId.get(2)?.slug).toBe('egg');
  });

  it('returns an empty map when given an empty list', () => {
    const lookup = buildIngredientLookup([]);
    expect(lookup.byId.size).toBe(0);
  });

  it('last entry wins on duplicate ids (defensive — id is the PK)', () => {
    const lookup = buildIngredientLookup([
      { id: 5, name: 'First', slug: 'first' },
      { id: 5, name: 'Second', slug: 'second' },
    ]);
    expect(lookup.byId.get(5)?.name).toBe('Second');
  });
});
