/**
 * Joined display types consumed by `RecipeRenderer` — PRD-121.
 *
 * The renderer owns the shape of `RecipeVersionWithCompiledData` and the
 * per-line `RecipeLineWithResolved` join (PRD-121 line 38 — the joined-row
 * shape lives with the renderer because the renderer renders it; PRD-119's
 * `food.recipes.getForRendering(versionId)` server procedure assembles the
 * payload). Defined here so the page, server procedure, Storybook stories,
 * and tests all import from the same place.
 *
 * No runtime code in this file — pure types, safe to import from the
 * server-side procedure without pulling React into the worker bundle.
 */
import type {
  IngredientRow,
  IngredientVariantRow,
  PrepStateRow,
  RecipeRow,
  RecipeStepRow,
  RecipeVersionRow,
} from '@pops/db-types';

/**
 * Joined display row for `recipe_lines` (PRD-116) — the raw column set plus
 * the ingredient / variant / prep_state / recipe-ref names needed to render
 * a row without further round-trips. PRD-119 builds this server-side; the
 * renderer is pure presentation.
 */
export interface RecipeLineWithResolved {
  // recipe_lines columns (PRD-116):
  id: number;
  position: number;
  ingredientId: number;
  variantId: number | null;
  prepStateId: number | null;
  isRecipeRef: boolean;
  recipeRefId: number | null;
  originalText: string;
  originalQty: number;
  originalUnit: string;
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: 'g' | 'ml' | 'count';
  optional: boolean;
  notes: string | null;

  // Joined display fields:
  ingredientName: string;
  ingredientSlug: string;
  variantName: string | null;
  variantSlug: string | null;
  prepStateName: string | null;
  prepStateSlug: string | null;
  /** When `isRecipeRef=true`, the link target's slug + title. */
  recipeRefSlug: string | null;
  recipeRefTitle: string | null;
}

/**
 * Everything `RecipeRenderer` needs to render a compiled recipe. The recipe
 * header lives on `recipes` (PRD-107) and the content on `recipe_versions`
 * (PRD-107); the compiled lines and steps live on `recipe_lines` /
 * `recipe_steps` (PRD-116). Yields join out to the relevant ingredient /
 * variant / prep_state rows for the human label.
 */
export interface RecipeVersionWithCompiledData {
  version: RecipeVersionRow;
  recipe: RecipeRow;
  lines: RecipeLineWithResolved[];
  steps: RecipeStepRow[];
  /** PRD-107 — yield foreign keys are nullable while the slug is auto-created. */
  yieldIngredient: IngredientRow | null;
  yieldVariant: IngredientVariantRow | null;
  yieldPrepState: PrepStateRow | null;
  /** Free-form tag list — empty array for recipes with no tags. */
  tags: string[];
}

export type RecipeRendererVariant = 'detail' | 'compact';

export interface RecipeRendererProps {
  recipeVersion: RecipeVersionWithCompiledData;
  /** Display-only multiplier on quantities. Defaults to 1.0. */
  scaleFactor?: number;
  /** Fire-and-forget — `RecipeRenderer` does not track running timers. */
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void;
  onTimerStop?: (stepPosition: number) => void;
  /** `'detail'` is the full page; `'compact'` is the list-card preview. */
  variant?: RecipeRendererVariant;
  className?: string;
}
