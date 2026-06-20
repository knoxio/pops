import {
  loadBatchInventory,
  loadSubstitutionsIndex,
} from '../substitutions/substitutions-resolve.js';
import { loadRecipeTagsMap, preFilterCandidates } from './candidates.js';
import { evaluateRecipeLines } from './line-evaluator.js';
import { loadRequiredLines } from './lines.js';
import { buildNameLookup } from './name-lookup.js';

/**
 * `food.solver.canICook` orchestrator — PRD-150.
 *
 * Pipeline:
 *   1. Pre-filter recipes (compiled + non-archived + current_version +
 *      client filters).
 *   2. Bulk-load required lines, pantry inventory, substitution index,
 *      and recipe-tag lists for the candidate set.
 *   3. Walk each recipe's lines via `evaluateRecipeLines`; drop
 *      uncookable recipes; collect SubBreakdown entries.
 *   4. Apply `excludeSubs` post-filter; sort by
 *      `subsNeeded ASC, lastCookedAt DESC NULLS LAST, slug ASC`;
 *      return totals + ranked rows.
 *
 * The cookableCount reported is post-`excludeSubs` so it always
 * matches `recipes.length` — that's what the UI labels with
 * "<cookable> of <total>".
 */
import type { FoodDb } from '../../../db/index.js';
import type { CandidateRecipe } from './candidates.js';
import type { CanICookInput } from './inputs.js';
import type { SolveRecipeRow, SolveResult } from './types.js';

function compareRows(a: SolveRecipeRow, b: SolveRecipeRow): number {
  if (a.subsNeeded !== b.subsNeeded) return a.subsNeeded - b.subsNeeded;
  if (a.lastCookedAt !== b.lastCookedAt) {
    if (a.lastCookedAt === null) return 1;
    if (b.lastCookedAt === null) return -1;
    // DESC = newer first
    return a.lastCookedAt < b.lastCookedAt ? 1 : -1;
  }
  return compareSlug(a.recipeSlug, b.recipeSlug);
}

function compareSlug(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function rowFromCandidate(
  candidate: CandidateRecipe,
  subsNeeded: number,
  subs: SolveRecipeRow['subs']
): SolveRecipeRow {
  return {
    recipeId: candidate.recipeId,
    recipeSlug: candidate.recipeSlug,
    title: candidate.title,
    recipeType: candidate.recipeType,
    heroImagePath: candidate.heroImagePath,
    prepMinutes: candidate.prepMinutes,
    cookMinutes: candidate.cookMinutes,
    lastCookedAt: candidate.lastCookedAt,
    subsNeeded,
    subs,
  };
}

export function canICook(db: FoodDb, input: CanICookInput): SolveResult {
  const candidates = preFilterCandidates(db, input);
  if (candidates.length === 0) {
    return { totalCandidates: 0, cookableCount: 0, recipes: [] };
  }

  const recipeIds = candidates.map((c) => c.recipeId);
  const versionIds = candidates.map((c) => c.recipeVersionId);

  const lineMap = loadRequiredLines(db, versionIds);
  const inventory = loadBatchInventory(db);
  const subIndex = loadSubstitutionsIndex(db, recipeIds);
  const recipeTagsMap = loadRecipeTagsMap(db, recipeIds);
  const names = buildNameLookup(db);

  const rows: SolveRecipeRow[] = [];
  for (const candidate of candidates) {
    const lines = lineMap.get(candidate.recipeVersionId) ?? [];
    const recipeTags = recipeTagsMap.get(candidate.recipeId) ?? [];
    const evalResult = evaluateRecipeLines({
      lines,
      recipeId: candidate.recipeId,
      recipeTags,
      inventory,
      subIndex,
      names,
    });
    if (!evalResult.cookable) continue;
    if (input.excludeSubs === true && evalResult.subsNeeded > 0) continue;
    rows.push(rowFromCandidate(candidate, evalResult.subsNeeded, evalResult.subs));
  }
  rows.sort(compareRows);

  // `totalCandidates` is the pool the solver ranged over BEFORE
  // excludeSubs trims; that keeps the "X of Y cookable" caption
  // honest for the user's current filter set.
  return {
    totalCandidates: candidates.length,
    cookableCount: rows.length,
    recipes: rows,
  };
}
