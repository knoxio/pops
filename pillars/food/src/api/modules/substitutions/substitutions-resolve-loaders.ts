/** SQL loaders for `substitutions-resolve`. */
import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { batches, substitutions, type FoodDb } from '../../../db/index.js';

import type {
  BatchInventory,
  BatchInventoryEntry,
  SubstitutionEdge,
  SubstitutionScope,
  SubstitutionsIndex,
} from './substitutions-resolve-types.js';

function inventoryKey(variantId: number, prepStateId: number | null): string {
  return prepStateId === null ? `${variantId}|*` : `${variantId}|${prepStateId}`;
}

export function buildInventoryKey(variantId: number, prepStateId: number | null): string {
  return inventoryKey(variantId, prepStateId);
}

export function loadBatchInventory(db: FoodDb): BatchInventory {
  const rows = db
    .select({
      variantId: batches.variantId,
      prepStateId: batches.prepStateId,
      qtyRemaining: batches.qtyRemaining,
      unit: batches.unit,
    })
    .from(batches)
    .where(and(sql`${batches.qtyRemaining} > 0`, isNull(batches.deletedAt)))
    .all();
  const map = new Map<string, BatchInventoryEntry>();
  for (const row of rows) {
    const key = inventoryKey(row.variantId, row.prepStateId);
    const existing = map.get(key);
    if (existing === undefined) {
      map.set(key, { totalQty: row.qtyRemaining, unit: row.unit });
    } else {
      existing.totalQty += row.qtyRemaining;
    }
  }
  return { byVariantPrep: map };
}

export function parseContextTags(raw: string): readonly string[] {
  // Malformed JSON in a single `substitutions.context_tags` row must
  // not crash the whole solver — treat unparseable / non-array rows as
  // a wildcard (`[]`) so they apply universally rather than dropping
  // out of the index altogether.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const value of parsed) {
    if (typeof value === 'string') out.push(value);
  }
  return out;
}

interface SubstitutionRow {
  id: number;
  fromIngredientId: number | null;
  fromVariantId: number | null;
  toIngredientId: number | null;
  toVariantId: number | null;
  ratio: number;
  contextTags: string;
  scope: SubstitutionScope;
  recipeId: number | null;
  notes: string | null;
}

function rowToEdge(row: SubstitutionRow): SubstitutionEdge {
  return {
    id: row.id,
    fromIngredientId: row.fromIngredientId,
    fromVariantId: row.fromVariantId,
    toIngredientId: row.toIngredientId,
    toVariantId: row.toVariantId,
    ratio: row.ratio,
    contextTags: parseContextTags(row.contextTags),
    scope: row.scope,
    recipeId: row.recipeId,
    notes: row.notes,
  };
}

function buildScopeFilter(recipeIds: readonly number[] | undefined): SQL {
  if (recipeIds === undefined) {
    // No caller-supplied recipe set — load every edge in the table.
    return sql`1 = 1`;
  }
  const global = eq(substitutions.scope, 'global');
  if (recipeIds.length === 0) return global;
  const scoped = and(eq(substitutions.scope, 'recipe'), inArray(substitutions.recipeId, recipeIds));
  const expr = or(global, scoped);
  if (expr === undefined) throw new Error('substitutions scope filter assembly failed');
  return expr;
}

function bucketEdges(rows: readonly SubstitutionRow[]): SubstitutionsIndex {
  const global: SubstitutionEdge[] = [];
  const byRecipe = new Map<number, SubstitutionEdge[]>();
  for (const row of rows) {
    const edge = rowToEdge(row);
    if (edge.scope === 'global') {
      global.push(edge);
      continue;
    }
    if (edge.recipeId === null) continue;
    const bucket = byRecipe.get(edge.recipeId);
    if (bucket === undefined) byRecipe.set(edge.recipeId, [edge]);
    else bucket.push(edge);
  }
  return { global, byRecipe };
}

export function loadSubstitutionsIndex(
  db: FoodDb,
  recipeIds?: readonly number[]
): SubstitutionsIndex {
  const rows = db
    .select({
      id: substitutions.id,
      fromIngredientId: substitutions.fromIngredientId,
      fromVariantId: substitutions.fromVariantId,
      toIngredientId: substitutions.toIngredientId,
      toVariantId: substitutions.toVariantId,
      ratio: substitutions.ratio,
      contextTags: substitutions.contextTags,
      scope: substitutions.scope,
      recipeId: substitutions.recipeId,
      notes: substitutions.notes,
    })
    .from(substitutions)
    .where(buildScopeFilter(recipeIds))
    .all();
  return bucketEdges(rows);
}
