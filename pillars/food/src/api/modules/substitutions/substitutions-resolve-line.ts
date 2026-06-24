import {
  loadCandidateBatches,
  loadLine,
  loadRecipeTags,
  loadVariantNames,
  loadVariantsByIngredient,
  type BatchRow,
  type VariantNameRow,
} from './substitutions-resolve-line-loaders.js';
/**
 * Per-line substitution resolution for the cook-modal picker.
 *
 * Wraps the sibling `substitutions-resolve` service (the owner of the
 * override + context-tag filtering pure functions) and hydrates each
 * surviving candidate with the batch inventory + display names the
 * `BatchOverridePicker` Substitutions section needs.
 *
 * Flow:
 *   1. Load the recipe_line row for `(recipeVersionId, lineIndex)`.
 *   2. Load the recipe's tags (the context-tag filter input).
 *   3. Bulk-load the substitutions index scoped to global + this recipe.
 *   4. Apply `resolveCandidatesForLine` (the `(from, to)`-pair override
 *      + OR-overlap context filter).
 *   5. For each candidate: collect target variants (ingredient-level
 *      edges fan out), load batches per variant, hydrate names.
 *
 * Ranking + the display cap live in the picker UI; this service returns
 * the full candidate set in the resolver's order so the sort can be
 * pinned independent of the DB layer.
 */
import {
  loadSubstitutionsIndex,
  resolveCandidatesForLine,
  type SubstitutionCandidate,
} from './substitutions-resolve.js';

import type { FoodDb } from '../../../db/index.js';
import type {
  ResolveForLineArgs,
  ResolveForLineResult,
  SubCandidate,
} from './substitutions-resolve-line-types.js';

export type * from './substitutions-resolve-line-types.js';

export function resolveForLine(db: FoodDb, args: ResolveForLineArgs): ResolveForLineResult {
  const line = loadLine(db, args);
  if (line === null) return { ok: false, reason: 'LineNotFound' };

  const recipeContextTags = loadRecipeTags(db, line.recipeId);
  const subIndex = loadSubstitutionsIndex(db, [line.recipeId]);
  const candidates = resolveCandidatesForLine(subIndex, {
    recipeId: line.recipeId,
    ingredientId: line.ingredientId,
    variantId: line.variantId,
    recipeTags: recipeContextTags,
  });
  const enriched = hydrateCandidates(db, candidates);

  return {
    ok: true,
    resolution: {
      lineIndex: args.lineIndex,
      lineVariantId: line.variantId,
      lineVariantName: line.variantName,
      linePrepStateId: line.prepStateId,
      linePrepStateLabel: line.prepStateLabel,
      lineQty: line.qty,
      lineUnit: line.unit,
      recipeContextTags,
      candidates: enriched,
    },
  };
}

function hydrateCandidates(
  db: FoodDb,
  candidates: readonly SubstitutionCandidate[]
): readonly SubCandidate[] {
  if (candidates.length === 0) return [];
  const ingredientLevelIds = uniqueIngredientIds(candidates);
  const ingredientToVariants = loadVariantsByIngredient(db, ingredientLevelIds);
  const variantIds = collectVariantIds(candidates, ingredientToVariants);
  if (variantIds.length === 0) {
    return candidates.map((c) => buildCandidate(c, null, [], ingredientToVariants));
  }
  const variantRows = loadVariantNames(db, variantIds);
  const batchesByVariant = loadCandidateBatches(db, variantIds);
  return candidates.flatMap((candidate) => {
    const targetVariantIds = expandVariants(candidate, ingredientToVariants);
    if (targetVariantIds.length === 0) return [];
    return targetVariantIds.flatMap((variantId) => {
      const variant = variantRows.get(variantId);
      if (variant === undefined) return [];
      return [
        buildCandidate(
          candidate,
          variant,
          batchesByVariant.get(variantId) ?? [],
          ingredientToVariants
        ),
      ];
    });
  });
}

function uniqueIngredientIds(candidates: readonly SubstitutionCandidate[]): number[] {
  const set = new Set<number>();
  for (const c of candidates) {
    if (c.toVariantId === null && c.toIngredientId !== null) set.add(c.toIngredientId);
  }
  return [...set];
}

function collectVariantIds(
  candidates: readonly SubstitutionCandidate[],
  ingredientToVariants: ReadonlyMap<number, readonly number[]>
): number[] {
  const set = new Set<number>();
  for (const c of candidates) {
    for (const v of expandVariants(c, ingredientToVariants)) set.add(v);
  }
  return [...set];
}

function expandVariants(
  candidate: SubstitutionCandidate,
  ingredientToVariants: ReadonlyMap<number, readonly number[]>
): readonly number[] {
  if (candidate.toVariantId !== null) return [candidate.toVariantId];
  if (candidate.toIngredientId === null) return [];
  return ingredientToVariants.get(candidate.toIngredientId) ?? [];
}

function buildCandidate(
  candidate: SubstitutionCandidate,
  variant: VariantNameRow | null,
  batchRows: readonly BatchRow[],
  _ingredientToVariants: ReadonlyMap<number, readonly number[]>
): SubCandidate {
  return {
    substitutionId: candidate.edgeId,
    ratio: candidate.ratio,
    contextTags: candidate.contextTags,
    scope: candidate.scope,
    recipeId: candidate.recipeId,
    substituteVariantId: variant?.id ?? 0,
    substituteVariantName: variant?.name ?? '',
    substituteIngredientId: variant?.ingredientId ?? candidate.toIngredientId ?? 0,
    substituteIngredientName: variant?.ingredientName ?? '',
    notes: candidate.notes,
    batches: batchRows.map((row) => ({
      batchId: row.id,
      qtyRemaining: row.qtyRemaining,
      unit: row.unit,
      location: row.location,
      expiresAt: row.expiresAt,
      prepStateId: row.prepStateId,
      prepStateLabel: row.prepStateLabel,
    })),
  };
}
