/**
 * Grammar coverage tests for `parseRecipeDsl`
 * (spec: pillars/food/docs/prds/dsl-parser).
 *
 * Each sample recipe in `samples.ts` proves one grammar dimension. The
 * error-coverage cases live in `parser-errors.test.ts`; round-trip and
 * perf cases live in `parser-roundtrip.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { parseRecipeDsl } from '../parser.js';
import {
  ALL_SAMPLES,
  COMPACT_SKIP_DESCRIPTOR,
  COMPONENT_WITH_YIELD,
  INLINE_TIME_TEMPERATURE,
  INTERSPERSED_MARKDOWN,
  MULTILINE_RECIPE_HEADER,
  NAMED_INGREDIENT_FORM,
  NON_YIELDING_TECHNIQUE,
  OPTIONAL_INGREDIENT,
  SIMPLE_PLATE,
  WITH_COMMENTS,
} from './samples.js';

import type { IngredientBlock, StepBlock } from '../ast.js';

describe('parser positive samples', () => {
  it.each(ALL_SAMPLES)('parses %s without errors', (_label, src) => {
    const r = parseRecipeDsl(src);
    if (!r.ok) {
      throw new Error(
        `expected ok=true, got errors:\n${r.errors.map((e) => `  ${e.code}: ${e.message}`).join('\n')}`
      );
    }
    expect(r.ast.recipe.slug).toBeDefined();
    expect(r.ast.yield.descriptor.ingredient).toBeDefined();
  });

  it('captures simple-plate header + ingredients + steps', () => {
    const r = parseRecipeDsl(SIMPLE_PLATE);
    if (!r.ok) throw new Error('parse failed');
    expect(r.ast.recipe.slug).toBe('grilled-cheese');
    expect(r.ast.recipe.title).toBe('Grilled Cheese');
    expect(r.ast.blocks.filter((b) => b.kind === 'ingredient')).toHaveLength(3);
    expect(r.ast.blocks.filter((b) => b.kind === 'step')).toHaveLength(3);
  });

  it('keeps the recipe_type literal from a component', () => {
    const r = parseRecipeDsl(COMPONENT_WITH_YIELD);
    if (!r.ok) throw new Error('parse failed');
    expect(r.ast.recipe.recipeType).toBe('component');
  });

  it('flags optional=true on the right block', () => {
    const r = parseRecipeDsl(OPTIONAL_INGREDIENT);
    if (!r.ok) throw new Error('parse failed');
    const ing = r.ast.blocks.find(
      (b): b is IngredientBlock => b.kind === 'ingredient' && b.index === 3
    );
    expect(ing?.optional).toBe(true);
  });

  it('preserves interspersed markdown blocks ordered with structural blocks', () => {
    const r = parseRecipeDsl(INTERSPERSED_MARKDOWN);
    if (!r.ok) throw new Error('parse failed');
    const kinds = r.ast.blocks.map((b) => b.kind);
    expect(kinds).toEqual(['markdown', 'ingredient', 'ingredient', 'markdown', 'step', 'step']);
    const md = r.ast.blocks.find((b) => b.kind === 'markdown');
    expect(md?.kind === 'markdown' && md.text.includes('Ingredients')).toBe(true);
  });

  it('parses inline @time + @temperature inside a step body', () => {
    const r = parseRecipeDsl(INLINE_TIME_TEMPERATURE);
    if (!r.ok) throw new Error('parse failed');
    const step = r.ast.blocks.find((b): b is StepBlock => b.kind === 'step');
    expect(step?.body.some((p) => p.kind === 'time' && p.qty.unit === 'min')).toBe(true);
    expect(step?.body.some((p) => p.kind === 'temperature' && p.qty.unit === 'c')).toBe(true);
  });

  it('accepts a multi-line @recipe header', () => {
    const r = parseRecipeDsl(MULTILINE_RECIPE_HEADER);
    if (!r.ok) throw new Error('parse failed');
    expect(r.ast.recipe.servings).toBe(2);
    expect(r.ast.recipe.prepTime).toEqual({ qty: 10, unit: 'min' });
    expect(r.ast.recipe.cookTime).toEqual({ qty: 20, unit: 'min' });
    expect(r.ast.recipe.summary).toContain('multi-line');
  });

  it('skips `//` line comments without affecting the AST', () => {
    const r = parseRecipeDsl(WITH_COMMENTS);
    if (!r.ok) throw new Error('parse failed');
    const md = r.ast.blocks.find((b) => b.kind === 'markdown');
    expect(md).toBeUndefined();
  });

  it('compiles the named-arg @ingredient form to the same shape as compact', () => {
    const r = parseRecipeDsl(NAMED_INGREDIENT_FORM);
    if (!r.ok) throw new Error('parse failed');
    const ing = r.ast.blocks.find((b): b is IngredientBlock => b.kind === 'ingredient');
    expect(ing?.descriptor.ingredient).toBe('chickpea');
    expect(ing?.descriptor.variant).toBe('cooked');
    expect(ing?.qty).toEqual({ qty: 240, unit: 'g' });
    expect(ing?.notes).toBe('drain reserved liquid');
  });

  it('treats `_` as a skipped middle segment in compact descriptors', () => {
    const r = parseRecipeDsl(COMPACT_SKIP_DESCRIPTOR);
    if (!r.ok) throw new Error('parse failed');
    const ing = r.ast.blocks.find((b): b is IngredientBlock => b.kind === 'ingredient');
    expect(ing?.descriptor.ingredient).toBe('basil');
    expect(ing?.descriptor.variant).toBeUndefined();
    expect(ing?.descriptor.prep).toBe('chopped');
  });

  it('accepts the non-yielding `0:none` form', () => {
    const r = parseRecipeDsl(NON_YIELDING_TECHNIQUE);
    if (!r.ok) throw new Error('parse failed');
    expect(r.ast.yield.qty).toEqual({ qty: 0, unit: 'none' });
  });
});
