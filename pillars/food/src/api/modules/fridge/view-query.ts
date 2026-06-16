/**
 * SQL primitives for `food.fridge.view` — PRD-147.
 *
 * Owns the SELECT that pulls every batch row for the current filter
 * combination plus the three head counts (visible / empty / deleted).
 * The orchestrator in `view.ts` glues these to the in-memory grouping.
 */
import { and, asc, eq, isNotNull, isNull, like, or, sql, type SQL } from 'drizzle-orm';

import {
  batches,
  ingredients,
  ingredientVariants,
  prepStates,
  recipeRuns,
  recipes,
  recipeVersions,
  type FoodDb,
} from '../../../db/index.js';

import type {
  BatchLocation,
  BatchSourceType,
  BatchUnit,
  FridgeViewCounts,
} from '../../../db/index.js';
import type { FridgeViewInput } from './inputs.js';

const EXPIRING_SOON_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export interface FlatBatchRow {
  id: number;
  variantId: number;
  variantName: string | null;
  variantSlug: string | null;
  ingredientId: number;
  ingredientName: string;
  ingredientSlug: string;
  prepStateLabel: string | null;
  qtyRemaining: number;
  unit: BatchUnit;
  expiresAt: string | null;
  producedAt: string;
  sourceType: BatchSourceType;
  sourceId: number | null;
  location: BatchLocation;
  notes: string | null;
  deletedAt: string | null;
}

export function selectRows(db: FoodDb, input: FridgeViewInput, now: Date): FlatBatchRow[] {
  const conds = baseConditions(input, now);
  return db
    .select({
      id: batches.id,
      variantId: batches.variantId,
      variantName: ingredientVariants.name,
      variantSlug: ingredientVariants.slug,
      ingredientId: ingredients.id,
      ingredientName: ingredients.name,
      ingredientSlug: ingredients.slug,
      prepStateLabel: prepStates.name,
      qtyRemaining: batches.qtyRemaining,
      unit: batches.unit,
      expiresAt: batches.expiresAt,
      producedAt: batches.producedAt,
      sourceType: batches.sourceType,
      sourceId: batches.sourceId,
      location: batches.location,
      notes: batches.notes,
      deletedAt: batches.deletedAt,
    })
    .from(batches)
    .innerJoin(ingredientVariants, eq(ingredientVariants.id, batches.variantId))
    .innerJoin(ingredients, eq(ingredients.id, ingredientVariants.ingredientId))
    .leftJoin(prepStates, eq(prepStates.id, batches.prepStateId))
    .where(and(...conds))
    .orderBy(
      asc(batches.location),
      asc(ingredients.name),
      sql`${batches.expiresAt} IS NULL`,
      asc(batches.expiresAt),
      asc(batches.producedAt)
    )
    .all();
}

export function selectCounts(db: FoodDb, input: FridgeViewInput): FridgeViewCounts {
  const locationFilter = buildLocationFilter(input);
  return {
    visible: countBy(
      db,
      and(sql`${batches.qtyRemaining} > 0`, isNull(batches.deletedAt), locationFilter)
    ),
    empty: countBy(
      db,
      and(sql`${batches.qtyRemaining} = 0`, isNull(batches.deletedAt), locationFilter)
    ),
    deleted: countBy(db, and(isNotNull(batches.deletedAt), locationFilter)),
  };
}

export function resolveRecipeSlugs(db: FoodDb, rows: readonly FlatBatchRow[]): Map<number, string> {
  const runIds = new Set<number>();
  for (const row of rows) {
    if (row.sourceType === 'recipe_run' && row.sourceId !== null) runIds.add(row.sourceId);
  }
  if (runIds.size === 0) return new Map();
  const idList = [...runIds];
  const found = db
    .select({ runId: recipeRuns.id, slug: recipes.slug })
    .from(recipeRuns)
    .innerJoin(recipeVersions, eq(recipeVersions.id, recipeRuns.recipeVersionId))
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(sql`${recipeRuns.id} IN ${idList}`)
    .all();
  const map = new Map<number, string>();
  for (const row of found) map.set(row.runId, row.slug);
  return map;
}

function baseConditions(input: FridgeViewInput, now: Date): SQL[] {
  const conds: SQL[] = [];
  if (input.includeEmpty !== true) conds.push(sql`${batches.qtyRemaining} > 0`);
  if (input.includeDeleted !== true) conds.push(isNull(batches.deletedAt));

  const locations = input.locations ?? null;
  if (locations !== null && locations.length > 0) {
    conds.push(sql`${batches.location} IN ${locations}`);
  }

  if (input.recipeYieldedOnly === true) {
    conds.push(eq(batches.sourceType, 'recipe_run'));
  }

  if (input.expiringSoon === true) {
    conds.push(buildExpiringSoonCondition(now));
  }

  appendSearchCondition(conds, input.search);

  return conds;
}

function appendSearchCondition(conds: SQL[], rawSearch: string | undefined): void {
  const search = (rawSearch ?? '').trim();
  if (search.length === 0) return;
  const pattern = `%${search.toLowerCase()}%`;
  const expr = or(
    like(sql`LOWER(${ingredients.name})`, pattern),
    like(sql`LOWER(${ingredientVariants.name})`, pattern)
  );
  if (expr !== undefined) conds.push(expr);
}

function buildExpiringSoonCondition(now: Date): SQL {
  // Anchor on the injectable `now` so tests / backfills that pin the clock
  // see a deterministic threshold (rather than `Date.now()` drifting between
  // the SELECT and the `daysToExpiry` projection in `view-grouping.ts`).
  const threshold = new Date(now.getTime() + EXPIRING_SOON_DAYS * MS_PER_DAY).toISOString();
  const expr = and(isNotNull(batches.expiresAt), sql`${batches.expiresAt} <= ${threshold}`);
  if (expr === undefined) throw new Error('expiringSoon condition assembly failed');
  return expr;
}

function buildLocationFilter(input: FridgeViewInput): SQL {
  if (input.locations !== undefined && input.locations.length > 0) {
    return sql`${batches.location} IN ${input.locations}`;
  }
  return sql`1=1`;
}

function countBy(db: FoodDb, where: SQL | undefined): number {
  return (
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(batches)
      .where(where)
      .get()?.n ?? 0
  );
}
