/**
 * Variants are scoped under their parent ingredient; `(ingredient_id, slug)`
 * UNIQUE is DB-enforced. Variants do NOT participate in `slug_registry`.
 */
import { eq } from 'drizzle-orm';

import { assertValidSlug } from '../../domain/slug.js';
import { ingredientVariants, type IngredientVariantRow } from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

export interface CreateVariantInput {
  ingredientId: number;
  name: string;
  slug: string;
  defaultUnit: 'g' | 'ml' | 'count';
  packageSizeG?: number | null;
  notes?: string | null;
  /** Feeds expiry auto-fill at cook time. Null = unknown / shelf-stable. */
  defaultShelfLifeDaysFridge?: number | null;
  /** Feeds expiry auto-fill at cook time. Null = unknown / shelf-stable. */
  defaultShelfLifeDaysFreezer?: number | null;
}

export function createVariant(db: FoodDb, input: CreateVariantInput): IngredientVariantRow {
  assertValidSlug(input.slug);
  const rows = db
    .insert(ingredientVariants)
    .values({
      ingredientId: input.ingredientId,
      name: input.name,
      slug: input.slug,
      defaultUnit: input.defaultUnit,
      packageSizeG: input.packageSizeG ?? null,
      notes: input.notes ?? null,
      defaultShelfLifeDaysFridge: input.defaultShelfLifeDaysFridge ?? null,
      defaultShelfLifeDaysFreezer: input.defaultShelfLifeDaysFreezer ?? null,
    })
    .returning()
    .all();
  return expectRow(rows, 'createVariant');
}

export interface UpdateVariantInput {
  name?: string;
  slug?: string;
  defaultUnit?: 'g' | 'ml' | 'count';
  packageSizeG?: number | null;
  notes?: string | null;
}

export function updateVariant(
  db: FoodDb,
  id: number,
  input: UpdateVariantInput
): IngredientVariantRow {
  if (input.slug !== undefined) {
    assertValidSlug(input.slug);
  }
  const rows = db
    .update(ingredientVariants)
    .set(input)
    .where(eq(ingredientVariants.id, id))
    .returning()
    .all();
  return expectRow(rows, `updateVariant(${id})`);
}

export function deleteVariant(db: FoodDb, id: number): void {
  db.delete(ingredientVariants).where(eq(ingredientVariants.id, id)).run();
}

export function getVariant(db: FoodDb, id: number): IngredientVariantRow | null {
  const rows = db.select().from(ingredientVariants).where(eq(ingredientVariants.id, id)).all();
  return rows[0] ?? null;
}
