/**
 * PRD-127 — ingredient-line heuristic unit tests.
 */
import { describe, expect, it } from 'vitest';

import { parseIngredientLine } from '../handlers/web/parse-ingredient-line.js';

describe('parseIngredientLine', () => {
  it('parses sticky metric "500g beef chuck mince"', () => {
    const r = parseIngredientLine('500g beef chuck mince');
    expect(r.qty).toBe(500);
    expect(r.unit).toBe('g');
    expect(r.descriptorSlug).toBe('beef-chuck-mince');
  });

  it('parses spaced metric "30ml olive oil"', () => {
    const r = parseIngredientLine('30ml olive oil');
    expect(r).toMatchObject({ qty: 30, unit: 'ml', descriptorSlug: 'olive-oil' });
  });

  it('parses imperial "1 cup milk"', () => {
    const r = parseIngredientLine('1 cup milk');
    expect(r).toMatchObject({ qty: 1, unit: 'cup', descriptorSlug: 'milk' });
  });

  it('parses unicode fraction "½ tsp salt"', () => {
    const r = parseIngredientLine('½ tsp salt');
    expect(r).toMatchObject({ qty: 0.5, unit: 'tsp', descriptorSlug: 'salt' });
  });

  it('parses mixed unicode fraction "2¼ cups flour"', () => {
    const r = parseIngredientLine('2¼ cups flour');
    expect(r.qty).toBeCloseTo(2.25);
    expect(r.unit).toBe('cup');
    expect(r.descriptorSlug).toBe('flour');
  });

  it('parses ASCII fraction "1/2 tsp salt"', () => {
    const r = parseIngredientLine('1/2 tsp salt');
    expect(r.qty).toBe(0.5);
    expect(r.unit).toBe('tsp');
    expect(r.descriptorSlug).toBe('salt');
  });

  it('parses mixed ASCII fraction "1 1/2 cups water"', () => {
    const r = parseIngredientLine('1 1/2 cups water');
    expect(r.qty).toBe(1.5);
    expect(r.unit).toBe('cup');
    expect(r.descriptorSlug).toBe('water');
  });

  it('strips trailing parenthetical "1 cup (240ml) milk"', () => {
    const r = parseIngredientLine('1 cup (240ml) milk');
    expect(r).toMatchObject({ qty: 1, unit: 'cup', descriptorSlug: 'milk' });
  });

  it('falls back to qty=1, unit=count when no quantity', () => {
    const r = parseIngredientLine('salt');
    expect(r).toMatchObject({ qty: 1, unit: 'count', descriptorSlug: 'salt' });
  });

  it('strips HTML tags in descriptors', () => {
    const r = parseIngredientLine('2 tbsp <b>olive oil</b>');
    expect(r.qty).toBe(2);
    expect(r.unit).toBe('tbsp');
    expect(r.descriptorSlug).toBe('olive-oil');
  });

  it('falls back to descriptor-only when input is empty', () => {
    const r = parseIngredientLine('');
    expect(r).toMatchObject({ qty: 1, unit: 'count', descriptorSlug: 'ingredient' });
  });

  it('handles "4 burger buns" (no unit-word: count)', () => {
    const r = parseIngredientLine('4 burger buns');
    expect(r).toMatchObject({ qty: 4, unit: 'count', descriptorSlug: 'burger-buns' });
  });

  it('handles "2 cloves garlic" (cloves → clove)', () => {
    const r = parseIngredientLine('2 cloves garlic');
    expect(r).toMatchObject({ qty: 2, unit: 'clove', descriptorSlug: 'garlic' });
  });
});
