/**
 * Joined display types consumed by `RecipeRenderer` and assembled by the
 * recipes get-for-rendering handler. Pure types so the server can build the
 * payload without pulling React in — no runtime code.
 */
import type {
  IngredientRow,
  IngredientVariantRow,
  PrepStateRow,
  RecipeRow,
  RecipeStepRow,
  RecipeVersionRow,
} from '../db/index.js';

/**
 * Joined display row for `recipe_lines` — the raw column set plus the
 * ingredient / variant / prep_state / recipe-ref names needed to render a row
 * without further round-trips.
 */
export interface RecipeLineWithResolved {
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
 * Everything `RecipeRenderer` needs to render a compiled recipe. Yields join
 * out to the relevant ingredient / variant / prep_state rows for the human
 * label.
 */
export interface RecipeVersionWithCompiledData {
  version: RecipeVersionRow;
  recipe: RecipeRow;
  lines: RecipeLineWithResolved[];
  steps: RecipeStepRow[];
  /** Yield foreign keys are nullable while the slug is auto-created. */
  yieldIngredient: IngredientRow | null;
  yieldVariant: IngredientVariantRow | null;
  yieldPrepState: PrepStateRow | null;
  tags: string[];
}

export type RecipeRendererVariant = 'detail' | 'compact';

export interface RecipeRendererProps {
  recipeVersion: RecipeVersionWithCompiledData;
  /** Display-only multiplier on quantities. Defaults to 1.0. */
  scaleFactor?: number;
  /**
   * Fire-and-forget — `RecipeRenderer` does not track running timers, so the
   * parent owns timer state. The renderer surfaces no Stop interaction, so
   * there is intentionally no `onTimerStop`.
   */
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void;
  /** `'detail'` is the full page; `'compact'` is the list-card preview. */
  variant?: RecipeRendererVariant;
  className?: string;
}
