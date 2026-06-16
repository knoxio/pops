/**
 * Wire types for `food.solver.canICook` — PRD-150.
 *
 * Kept separate from the orchestrator so the tRPC router and the
 * frontend can both depend on the types without pulling in service
 * code. Mirrors the shapes defined in PRD-150's README.
 */

export type RecipeTypeLiteral =
  | 'plate'
  | 'component'
  | 'technique'
  | 'sauce'
  | 'dressing'
  | 'drink'
  | 'condiment';

export interface SolveSubBreakdown {
  /** `recipe_lines.position` of the line resolved by this sub. */
  lineIndex: number;
  fromIngredientName: string;
  fromVariantName: string | null;
  candidateSubName: string;
  /** `substitutions.id`. */
  substitutionId: number;
}

export interface SolveRecipeRow {
  recipeId: number;
  recipeSlug: string;
  title: string;
  recipeType: RecipeTypeLiteral | null;
  heroImagePath: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** ISO datetime of the most recent completed `recipe_runs` row, or null. */
  lastCookedAt: string | null;
  /**
   * Count of LINES resolved by a substitution. A single edge that
   * resolves two lines counts as 2 (one per line).
   */
  subsNeeded: number;
  subs: SolveSubBreakdown[];
}

export interface SolveResult {
  /** Count of recipes considered after pre-filters (type/tags/maxMinutes). */
  totalCandidates: number;
  /** Count of recipes that turned out cookable; equals `recipes.length`. */
  cookableCount: number;
  /** Cookable recipes only; sorted by `subsNeeded ASC, lastCookedAt DESC NULLS LAST, slug ASC`. */
  recipes: SolveRecipeRow[];
}
