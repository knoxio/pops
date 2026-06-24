/**
 * Backing read for the `batches.searchForConsume` contract operation.
 * See pillars/food/docs/prds/fifo-consumption-ui.
 *
 * Joined read projection used by `BatchOverridePicker` to surface
 * batches a user can pick when overriding a shortfall. FIFO-ordered
 * server-side (`expires_at ASC NULLS LAST, produced_at ASC`) so the
 * picker dropdown defaults to the same row `consumeForRun`
 * (pillars/food/docs/prds/cook-event-recording) would draw next.
 *
 * Filters: soft-deleted batches (`deleted_at IS NOT NULL`) and empty
 * batches (`qty_remaining <= qtyGreaterThan`, default 0) are excluded.
 * `variantId` takes precedence over `ingredientId` when both are set.
 */
import { and, asc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';

import {
  batches,
  ingredients,
  ingredientVariants,
  prepStates,
  type FoodDb,
} from '../../../db/index.js';

import type { BatchForConsumeRow, BatchLocation } from '../../../db/index.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_QTY = 0;

export interface SearchForConsumeArgs {
  ingredientId?: number;
  variantId?: number;
  location?: BatchLocation;
  qtyGreaterThan?: number;
  limit?: number;
}

export function searchForConsume(
  db: FoodDb,
  args: SearchForConsumeArgs
): { items: BatchForConsumeRow[] } {
  const minQty = args.qtyGreaterThan ?? DEFAULT_MIN_QTY;
  const limit = args.limit ?? DEFAULT_LIMIT;

  const conditions: SQL[] = [isNull(batches.deletedAt), gt(batches.qtyRemaining, minQty)];

  if (args.variantId !== undefined) {
    conditions.push(eq(batches.variantId, args.variantId));
  } else if (args.ingredientId !== undefined) {
    conditions.push(eq(ingredientVariants.ingredientId, args.ingredientId));
  }

  if (args.location !== undefined) {
    conditions.push(eq(batches.location, args.location));
  }

  const rows = db
    .select({
      id: batches.id,
      variantId: batches.variantId,
      variantName: ingredientVariants.name,
      variantSlug: ingredientVariants.slug,
      ingredientId: ingredients.id,
      ingredientName: ingredients.name,
      prepStateId: batches.prepStateId,
      prepStateLabel: prepStates.name,
      qtyRemaining: batches.qtyRemaining,
      unit: batches.unit,
      location: batches.location,
      expiresAt: batches.expiresAt,
      producedAt: batches.producedAt,
    })
    .from(batches)
    .innerJoin(ingredientVariants, eq(ingredientVariants.id, batches.variantId))
    .innerJoin(ingredients, eq(ingredients.id, ingredientVariants.ingredientId))
    .leftJoin(prepStates, eq(prepStates.id, batches.prepStateId))
    .where(and(...conditions))
    .orderBy(sql`${batches.expiresAt} IS NULL`, asc(batches.expiresAt), asc(batches.producedAt))
    .limit(limit)
    .all();

  return { items: rows };
}
