/**
 * Per-line cookability evaluator — PRD-150.
 *
 * For each non-optional line, asks two questions in order:
 *
 *   1. Does the pantry (`batches` sum filtered to (variantId,
 *      prepStateId) with `qty_remaining > 0 AND deleted_at IS NULL`)
 *      cover the line's canonical qty? FIFO covers it; no sub needed.
 *   2. Otherwise: walk the substitution candidates (recipe-scoped
 *      override + global, context-tag filtered) and find the first
 *      whose `to` side has a batch sum that, multiplied by the edge's
 *      `ratio`, satisfies the line.
 *
 * The first qualifying candidate wins. The line is `uncovered` if
 * neither FIFO nor any sub clears the threshold — that recipe is then
 * dropped from the result.
 */
import {
  buildInventoryKey,
  resolveCandidatesForLine,
  type BatchInventory,
  type SubstitutionsIndex,
} from '../services/substitutions-resolve.js';
import { describeCandidate, type NameLookup } from './name-lookup.js';

import type { SolverLine } from './lines.js';
import type { SolveSubBreakdown } from './types.js';

export interface LineEvaluation {
  cookable: boolean;
  subsNeeded: number;
  subs: SolveSubBreakdown[];
}

function lineFifoCoverage(line: SolverLine, inventory: BatchInventory): number {
  if (line.variantId === null) return 0;
  const key = buildInventoryKey(line.variantId, line.prepStateId);
  const entry = inventory.byVariantPrep.get(key);
  if (entry === undefined) return 0;
  return entry.totalQty;
}

function inventoryForCandidate(
  inventory: BatchInventory,
  toVariantId: number | null,
  prepStateId: number | null
): number {
  if (toVariantId === null) return 0;
  // Candidate match retains the line's prep state — the substitution
  // doesn't change how the ingredient is prepared, only what it is.
  // If the user actually has the sub in a different prep state, the
  // strict (variant, prepState) key would miss it — fall back to the
  // null-prep slot so subs match across prep variations.
  const exactKey = buildInventoryKey(toVariantId, prepStateId);
  const exact = inventory.byVariantPrep.get(exactKey);
  if (exact !== undefined) return exact.totalQty;
  if (prepStateId === null) return 0;
  const fallback = inventory.byVariantPrep.get(buildInventoryKey(toVariantId, null));
  return fallback?.totalQty ?? 0;
}

export interface EvaluateLinesArgs {
  lines: readonly SolverLine[];
  recipeId: number;
  recipeTags: readonly string[];
  inventory: BatchInventory;
  subIndex: SubstitutionsIndex;
  names: NameLookup;
}

function tryEvaluateLine(line: SolverLine, args: EvaluateLinesArgs): SolveSubBreakdown | null {
  const candidates = resolveCandidatesForLine(args.subIndex, {
    recipeId: args.recipeId,
    ingredientId: line.ingredientId,
    variantId: line.variantId,
    recipeTags: args.recipeTags,
  });
  for (const candidate of candidates) {
    const available = inventoryForCandidate(
      args.inventory,
      candidate.toVariantId,
      line.prepStateId
    );
    if (available * candidate.ratio >= line.qty) {
      return {
        lineIndex: line.position,
        fromIngredientName: line.ingredientName,
        fromVariantName: line.variantName,
        candidateSubName: describeCandidate(
          args.names,
          candidate.toIngredientId,
          candidate.toVariantId
        ),
        substitutionId: candidate.edgeId,
      };
    }
  }
  return null;
}

export function evaluateRecipeLines(args: EvaluateLinesArgs): LineEvaluation {
  const subs: SolveSubBreakdown[] = [];
  for (const line of args.lines) {
    const fifoQty = lineFifoCoverage(line, args.inventory);
    if (fifoQty >= line.qty) continue;
    const breakdown = tryEvaluateLine(line, args);
    if (breakdown === null) {
      return { cookable: false, subsNeeded: 0, subs: [] };
    }
    subs.push(breakdown);
  }
  return { cookable: true, subsNeeded: subs.length, subs };
}
