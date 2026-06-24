/**
 * Batch fixtures (+ one recipe run + its consumptions).
 *
 * Rows span the matrix:
 *   - shelf-stable (NULL expires_at) — salt
 *   - fridge with explicit expiry — chicken breast (close to today)
 *   - freezer batch — beef mince
 *   - 2× same variant with different expiry — milk → exercises FIFO ordering
 *   - 1 with NULL prep_state — onion yellow
 *   - 1 from a `recipe_run` source — smash-burger yields 360 g beef:mince:cooked
 *
 * `producedAt` / `expiresAt` are anchored to a stable date so the seed is
 * deterministic; both are stored as ISO strings.
 */

export type Location = 'pantry' | 'fridge' | 'freezer' | 'other';
export type SourceType = 'purchase' | 'recipe_run' | 'gift' | 'other';

export interface BatchFixture {
  /** `<ingredient>:<variant>` compound slug. */
  variantOfIngredient: string;
  variantSlug: string;
  /** Optional prep-state slug; NULL means "no prep applied yet". */
  prepStateSlug?: string;
  qtyRemaining: number;
  unit: 'g' | 'ml' | 'count';
  sourceType: SourceType;
  /** Set for sourceType=recipe_run via the seeded recipe-run id. */
  recipeRunRecipeSlug?: string;
  location: Location;
  /** ISO date string. */
  producedAt: string;
  /** ISO date string. NULL = shelf-stable. */
  expiresAt: string | null;
  notes?: string;
}

export const BATCH_ANCHOR_DATE = '2026-06-10';

function isoOffset(offsetDays: number): string {
  const base = new Date(`${BATCH_ANCHOR_DATE}T08:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString();
}

export const BATCH_FIXTURES: readonly BatchFixture[] = [
  // 1. Shelf-stable pantry salt — NULL expires_at
  {
    variantOfIngredient: 'salt',
    variantSlug: 'table',
    qtyRemaining: 500,
    unit: 'g',
    sourceType: 'purchase',
    location: 'pantry',
    producedAt: isoOffset(-30),
    expiresAt: null,
    notes: 'Shelf-stable; pantry default',
  },
  // 2. Fridge chicken close to expiry
  {
    variantOfIngredient: 'chicken',
    variantSlug: 'breast',
    qtyRemaining: 400,
    unit: 'g',
    sourceType: 'purchase',
    location: 'fridge',
    producedAt: isoOffset(-1),
    expiresAt: isoOffset(1),
    notes: '2-day fridge window',
  },
  // 3. Freezer beef mince
  {
    variantOfIngredient: 'beef',
    variantSlug: 'mince',
    qtyRemaining: 600,
    unit: 'g',
    sourceType: 'purchase',
    location: 'freezer',
    producedAt: isoOffset(-7),
    expiresAt: isoOffset(173),
    notes: '180-day freezer window',
  },
  // 4. Two milk batches, different expiry — exercises FIFO ordering
  {
    variantOfIngredient: 'milk',
    variantSlug: 'full-cream',
    qtyRemaining: 1000,
    unit: 'ml',
    sourceType: 'purchase',
    location: 'fridge',
    producedAt: isoOffset(-2),
    expiresAt: isoOffset(5),
    notes: 'Older milk — FIFO will draw from this one first',
  },
  // 5. Newer milk batch
  {
    variantOfIngredient: 'milk',
    variantSlug: 'full-cream',
    qtyRemaining: 1000,
    unit: 'ml',
    sourceType: 'purchase',
    location: 'fridge',
    producedAt: isoOffset(0),
    expiresAt: isoOffset(7),
  },
  // 6. NULL prep_state onion in pantry — exercises the partial-NULL match in consumeForRun
  {
    variantOfIngredient: 'onion',
    variantSlug: 'yellow',
    qtyRemaining: 5,
    unit: 'count',
    sourceType: 'purchase',
    location: 'pantry',
    producedAt: isoOffset(-3),
    expiresAt: isoOffset(11),
  },
  // 7. Olive oil pantry
  {
    variantOfIngredient: 'olive-oil',
    variantSlug: 'extra-virgin',
    qtyRemaining: 750,
    unit: 'ml',
    sourceType: 'purchase',
    location: 'pantry',
    producedAt: isoOffset(-60),
    expiresAt: null,
  },
  // 8. Butter fridge
  {
    variantOfIngredient: 'butter',
    variantSlug: 'unsalted',
    qtyRemaining: 250,
    unit: 'g',
    sourceType: 'purchase',
    location: 'fridge',
    producedAt: isoOffset(-5),
    expiresAt: isoOffset(25),
  },
  // 9. Cheese parmesan fridge
  {
    variantOfIngredient: 'cheese',
    variantSlug: 'parmesan-grated',
    qtyRemaining: 200,
    unit: 'g',
    sourceType: 'purchase',
    location: 'fridge',
    producedAt: isoOffset(-4),
    expiresAt: isoOffset(26),
    notes: 'Gift',
  },
  // 10. Recipe-run yielded batch — smash-burger seeded run produces 360 g cooked beef mince
  {
    variantOfIngredient: 'beef',
    variantSlug: 'mince',
    prepStateSlug: 'roughly-chopped',
    qtyRemaining: 360,
    unit: 'g',
    sourceType: 'recipe_run',
    recipeRunRecipeSlug: 'smash-burger',
    location: 'fridge',
    producedAt: isoOffset(-1),
    expiresAt: isoOffset(2),
    notes: 'Cooked patties from Sunday prep',
  },
];

/**
 * Single seeded `recipe_runs` row so batch #10 has a valid `source_id`.
 * `consumeForRun` is exercised by drawing 200 g beef from the freezer
 * batch (#3) when this run is recorded.
 */
export interface RecipeRunFixture {
  recipeSlug: string;
  scaleFactor: number;
  startedAtOffsetDays: number;
  completedAtOffsetDays: number;
  rating: number | null;
  notes?: string;
  /** Consumes recorded as part of the run — variants drawn from earlier batches. */
  consumes: readonly { fromBatchIndex: number; qtyConsumed: number; unit: 'g' | 'ml' | 'count' }[];
}

export const RECIPE_RUN_FIXTURE: RecipeRunFixture = {
  recipeSlug: 'smash-burger',
  scaleFactor: 1.0,
  startedAtOffsetDays: -1,
  completedAtOffsetDays: -1,
  rating: 4,
  notes: 'Seeded Sunday prep run',
  consumes: [
    // Draws 200g cooked from batch #3 (beef mince freezer)
    { fromBatchIndex: 2, qtyConsumed: 200, unit: 'g' },
  ],
};
