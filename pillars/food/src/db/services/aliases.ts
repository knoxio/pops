import { and, eq, inArray, like, or } from 'drizzle-orm';

import { ingredientAliases, type IngredientAliasRow } from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

export type AliasSource = 'user' | 'llm' | 'ingest';

export type AliasTarget = { kind: 'ingredient'; id: number } | { kind: 'variant'; id: number };

export interface CreateAliasInput {
  alias: string;
  target: AliasTarget;
  source?: AliasSource;
}

export interface ListAliasesInput {
  search?: string;
  source?: AliasSource;
  target?: AliasTarget;
}

export function createAlias(db: FoodDb, input: CreateAliasInput): IngredientAliasRow {
  const source = input.source ?? 'user';
  const ingredientId = input.target.kind === 'ingredient' ? input.target.id : null;
  const variantId = input.target.kind === 'variant' ? input.target.id : null;
  const rows = db
    .insert(ingredientAliases)
    .values({
      alias: input.alias,
      source,
      ingredientId,
      variantId,
    })
    .returning()
    .all();
  return expectRow(rows, 'createAlias');
}

export function updateAliasText(db: FoodDb, id: number, alias: string): IngredientAliasRow {
  const rows = db
    .update(ingredientAliases)
    .set({ alias })
    .where(eq(ingredientAliases.id, id))
    .returning()
    .all();
  return expectRow(rows, `updateAliasText(${id})`);
}

export function deleteAlias(db: FoodDb, id: number): void {
  db.delete(ingredientAliases).where(eq(ingredientAliases.id, id)).run();
}

export function listAliases(db: FoodDb, input: ListAliasesInput = {}): IngredientAliasRow[] {
  const filters = [];
  if (input.search !== undefined && input.search.length > 0) {
    filters.push(like(ingredientAliases.alias, `%${input.search}%`));
  }
  if (input.source !== undefined) {
    filters.push(eq(ingredientAliases.source, input.source));
  }
  if (input.target !== undefined) {
    if (input.target.kind === 'ingredient') {
      filters.push(eq(ingredientAliases.ingredientId, input.target.id));
    } else {
      filters.push(eq(ingredientAliases.variantId, input.target.id));
    }
  }
  const query = db.select().from(ingredientAliases);
  return filters.length > 0 ? query.where(and(...filters)).all() : query.all();
}

export interface MergeAliasesInput {
  aliasIds: readonly number[];
  target: AliasTarget;
}

export interface MergeAliasesResult {
  mergedCount: number;
}

/**
 * Re-point a set of aliases at a single canonical target. Aliases already
 * pointing at the target are left untouched. Each row to be migrated is
 * recreated (INSERT) at the new target and the original row is removed
 * (DELETE) in the same transaction.
 *
 * The INSERT uses `ON CONFLICT DO NOTHING` against the per-target partial
 * UNIQUE indexes: when the same alias text already exists at the canonical
 * target, the duplicate is silently collapsed onto the existing row while
 * the original is still removed. Without this, a merge across targets that
 * share alias text would fail SQLite's UNIQUE and abort the transaction.
 */
export function mergeAliases(db: FoodDb, input: MergeAliasesInput): MergeAliasesResult {
  if (input.aliasIds.length === 0) return { mergedCount: 0 };
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(ingredientAliases)
      .where(inArray(ingredientAliases.id, [...input.aliasIds]))
      .all();
    const ingredientId = input.target.kind === 'ingredient' ? input.target.id : null;
    const variantId = input.target.kind === 'variant' ? input.target.id : null;
    let mergedCount = 0;
    for (const row of existing) {
      const alreadyAtTarget = row.ingredientId === ingredientId && row.variantId === variantId;
      if (alreadyAtTarget) continue;
      tx.delete(ingredientAliases).where(eq(ingredientAliases.id, row.id)).run();
      tx.insert(ingredientAliases)
        .values({
          alias: row.alias,
          source: row.source,
          ingredientId,
          variantId,
        })
        .onConflictDoNothing()
        .run();
      mergedCount += 1;
    }
    return { mergedCount };
  });
}

export interface BulkApproveAliasesResult {
  updatedCount: number;
}

/**
 * Flip a set of `source='llm'` aliases to `source='user'`. No-op for rows
 * already at `source='user'` (idempotent). Rows in the supplied id list
 * with other sources are also untouched — only `llm` → `user` is permitted.
 */
export function bulkApproveAliases(
  db: FoodDb,
  aliasIds: readonly number[]
): BulkApproveAliasesResult {
  if (aliasIds.length === 0) return { updatedCount: 0 };
  const result = db
    .update(ingredientAliases)
    .set({ source: 'user' })
    .where(and(inArray(ingredientAliases.id, [...aliasIds]), eq(ingredientAliases.source, 'llm')))
    .returning({ id: ingredientAliases.id })
    .all();
  return { updatedCount: result.length };
}

export { listAliasesWithTargets, type AliasWithTargetRow } from './aliases-queries.js';

/**
 * Predicate used by the data page to flag "no target left" — e.g. after a
 * variant is deleted and any orphan aliases need re-homing. The XOR CHECK
 * prevents this on insert, but defensive read.
 */
export function aliasIsOrphaned(row: IngredientAliasRow): boolean {
  return row.ingredientId === null && row.variantId === null;
}

/**
 * Returns aliases whose text matches a substring (case-insensitive via the
 * NOCASE index on `alias`). Used by the substitutions tab's text search.
 */
export function searchAliases(db: FoodDb, query: string, limit = 25): IngredientAliasRow[] {
  if (query.length === 0) return [];
  return db
    .select()
    .from(ingredientAliases)
    .where(or(like(ingredientAliases.alias, `%${query}%`)))
    .limit(limit)
    .all();
}
