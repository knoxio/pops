export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MealType = (typeof MEAL_TYPES)[number];

/**
 * A scheduled meal slot on a given date. Mirrors the intended API response
 * (camelCase) for the food pillar.
 *
 * The contract shape is deliberately narrower than the live
 * `food.plan.weekView` rows: the live persistence model uses an integer
 * primary key, a configurable slot slug (with display order + custom
 * names), `recipeVersionId`, `plannedServings`, and a free-form notes
 * column. The contract pins a small, stable surface — opaque string `id`,
 * date-only `date`, four canonical meal types, nullable `recipeId`, and
 * nullable `notes` — that downstream consumers (SDK, Swift codegen,
 * apps) can code against without re-shaping the runtime row.
 */
export interface MealPlan {
  id: string;
  /** Date-only string (`YYYY-MM-DD`). Validated by `MealPlanSchema` via `.date()`. */
  date: string;
  mealType: MealType;
  recipeId: string | null;
  notes: string | null;
  /** ISO-8601 timestamp. Validated by `MealPlanSchema` via `.datetime()`. */
  lastEditedTime: string;
}
