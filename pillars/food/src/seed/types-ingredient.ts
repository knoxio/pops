/**
 * Fixture shapes shared by the ingredient/variant fixture files.
 *
 * Split from `data-ingredients-*.ts` so the data files stay under the
 * 200-line lint cap.
 */

export type Unit = 'g' | 'ml' | 'count';

export interface VariantFixture {
  name: string;
  slug: string;
  defaultUnit?: Unit;
  packageSizeG?: number;
  shelfLifeDaysFridge?: number | null;
  shelfLifeDaysFreezer?: number | null;
  notes?: string;
}

export interface IngredientFixture {
  name: string;
  slug: string;
  defaultUnit: Unit;
  densityGPerMl?: number;
  /** Default fridge shelf-life applied to every variant unless overridden. */
  shelfLifeDaysFridge?: number | null;
  /** Default freezer shelf-life applied to every variant unless overridden. */
  shelfLifeDaysFreezer?: number | null;
  variants: readonly VariantFixture[];
  /** Optional child ingredients (depth-2 hierarchy). */
  children?: readonly IngredientFixture[];
  notes?: string;
}
