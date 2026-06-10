/**
 * Unit tests for the pure-function half of `substitutions-resolve` —
 * PRD-150. The bulk-load + inventory paths are covered by
 * `solver.test.ts`; this file pins the candidate-resolution algorithm
 * (recipe-scoped override, context-tag OR-overlap) against synthetic
 * indices so a regression doesn't have to push through a fixture.
 */
import { describe, expect, it } from 'vitest';

import {
  resolveCandidatesForLine,
  type SubstitutionEdge,
  type SubstitutionsIndex,
} from '../substitutions-resolve.js';

function edge(partial: Partial<SubstitutionEdge> & { id: number }): SubstitutionEdge {
  return {
    fromIngredientId: null,
    fromVariantId: null,
    toIngredientId: null,
    toVariantId: null,
    ratio: 1,
    contextTags: [],
    scope: 'global',
    recipeId: null,
    ...partial,
  };
}

describe('resolveCandidatesForLine', () => {
  it('matches edges that key off the line ingredient', () => {
    const index: SubstitutionsIndex = {
      global: [edge({ id: 1, fromIngredientId: 10, toVariantId: 99 })],
      byRecipe: new Map(),
    };
    const candidates = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 10,
      variantId: null,
      recipeTags: [],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.edgeId).toBe(1);
  });

  it('rejects edges whose from side does not match the line', () => {
    const index: SubstitutionsIndex = {
      global: [edge({ id: 1, fromIngredientId: 10, toVariantId: 99 })],
      byRecipe: new Map(),
    };
    const candidates = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 11,
      variantId: null,
      recipeTags: [],
    });
    expect(candidates).toEqual([]);
  });

  it('keeps a global edge when no recipe-scoped row exists', () => {
    const index: SubstitutionsIndex = {
      global: [edge({ id: 1, fromIngredientId: 10, toVariantId: 99 })],
      byRecipe: new Map(),
    };
    const candidates = resolveCandidatesForLine(index, {
      recipeId: 5,
      ingredientId: 10,
      variantId: null,
      recipeTags: [],
    });
    expect(candidates.map((c) => c.edgeId)).toEqual([1]);
  });

  it('lets a recipe-scoped edge supersede the global edge with the same (from, to) pair', () => {
    const index: SubstitutionsIndex = {
      global: [edge({ id: 1, fromIngredientId: 10, toVariantId: 99 })],
      byRecipe: new Map<number, SubstitutionEdge[]>([
        [
          5,
          [
            edge({
              id: 2,
              fromIngredientId: 10,
              toVariantId: 99,
              scope: 'recipe',
              recipeId: 5,
            }),
          ],
        ],
      ]),
    };
    const candidates = resolveCandidatesForLine(index, {
      recipeId: 5,
      ingredientId: 10,
      variantId: null,
      recipeTags: [],
    });
    expect(candidates.map((c) => c.edgeId)).toEqual([2]);
  });

  it('keeps other global edges from the same `from` when only one pair is overridden', () => {
    const index: SubstitutionsIndex = {
      global: [
        edge({ id: 1, fromIngredientId: 10, toVariantId: 99 }),
        edge({ id: 3, fromIngredientId: 10, toVariantId: 100 }),
      ],
      byRecipe: new Map<number, SubstitutionEdge[]>([
        [
          5,
          [
            edge({
              id: 2,
              fromIngredientId: 10,
              toVariantId: 99,
              scope: 'recipe',
              recipeId: 5,
            }),
          ],
        ],
      ]),
    };
    const candidates = resolveCandidatesForLine(index, {
      recipeId: 5,
      ingredientId: 10,
      variantId: null,
      recipeTags: [],
    });
    expect(candidates.map((c) => c.edgeId).toSorted()).toEqual([2, 3]);
  });

  it('treats an edge with empty context_tags as a wildcard match for any recipe tags', () => {
    const index: SubstitutionsIndex = {
      global: [edge({ id: 1, fromIngredientId: 10, toVariantId: 99, contextTags: [] })],
      byRecipe: new Map(),
    };
    const candidates = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 10,
      variantId: null,
      recipeTags: ['baking'],
    });
    expect(candidates).toHaveLength(1);
  });

  it('skips a tagged edge when the recipe has zero tags', () => {
    const index: SubstitutionsIndex = {
      global: [edge({ id: 1, fromIngredientId: 10, toVariantId: 99, contextTags: ['baking'] })],
      byRecipe: new Map(),
    };
    const candidates = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 10,
      variantId: null,
      recipeTags: [],
    });
    expect(candidates).toEqual([]);
  });

  it('honours OR overlap on context tags', () => {
    const index: SubstitutionsIndex = {
      global: [
        edge({
          id: 1,
          fromIngredientId: 10,
          toVariantId: 99,
          contextTags: ['baking', 'dessert'],
        }),
      ],
      byRecipe: new Map(),
    };
    const yesOverlap = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 10,
      variantId: null,
      recipeTags: ['savoury', 'dessert'],
    });
    expect(yesOverlap.map((c) => c.edgeId)).toEqual([1]);

    const noOverlap = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 10,
      variantId: null,
      recipeTags: ['savoury'],
    });
    expect(noOverlap).toEqual([]);
  });

  it('variant-side edges only match when the line variant matches', () => {
    const index: SubstitutionsIndex = {
      global: [edge({ id: 1, fromVariantId: 7, toVariantId: 9 })],
      byRecipe: new Map(),
    };
    const noVariant = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 10,
      variantId: null,
      recipeTags: [],
    });
    expect(noVariant).toEqual([]);

    const sameVariant = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 10,
      variantId: 7,
      recipeTags: [],
    });
    expect(sameVariant.map((c) => c.edgeId)).toEqual([1]);

    const differentVariant = resolveCandidatesForLine(index, {
      recipeId: 1,
      ingredientId: 10,
      variantId: 8,
      recipeTags: [],
    });
    expect(differentVariant).toEqual([]);
  });
});
