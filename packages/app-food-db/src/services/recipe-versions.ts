/**
 * Recipe version services — PRD-107.
 *
 * Version lifecycle:
 *   draft  ──promote──► current
 *   current ──superseded─► archived   (only when another version is promoted)
 *   draft  ──reject────► archived
 *
 * Promotion is an atomic three-step: write the new current, archive any
 * previously-current row, update `recipes.current_version_id`. The partial
 * UNIQUE `uq_recipe_versions_one_current` ensures the second of two
 * concurrent promotions fails — the service maps that SQLite error to a
 * typed `ConcurrentPromotion`.
 */
import { and, eq, max } from 'drizzle-orm';

import {
  CannotEditPublishedVersion,
  CannotPromoteUncompiledVersion,
  ConcurrentPromotion,
} from '../errors.js';
import { recipes, recipeVersions, type RecipeVersionRow } from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

export interface CreateNewVersionInput {
  recipeId: number;
  title: string;
  bodyDsl: string;
  summary?: string | null;
  servings?: number | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  sourceId?: number | null;
}

export function createNewVersion(db: FoodDb, input: CreateNewVersionInput): RecipeVersionRow {
  return db.transaction((tx) => {
    const maxRow = tx
      .select({ max: max(recipeVersions.versionNo) })
      .from(recipeVersions)
      .where(eq(recipeVersions.recipeId, input.recipeId))
      .all();
    const next = (maxRow[0]?.max ?? 0) + 1;
    const rows = tx
      .insert(recipeVersions)
      .values({
        recipeId: input.recipeId,
        versionNo: next,
        status: 'draft',
        title: input.title,
        summary: input.summary ?? null,
        bodyDsl: input.bodyDsl,
        servings: input.servings ?? null,
        prepMinutes: input.prepMinutes ?? null,
        cookMinutes: input.cookMinutes ?? null,
        sourceId: input.sourceId ?? null,
      })
      .returning()
      .all();
    return expectRow(rows, `createNewVersion(recipe=${input.recipeId})`);
  });
}

export interface UpdateDraftVersionInput {
  title?: string;
  summary?: string | null;
  bodyDsl?: string;
  servings?: number | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
}

/**
 * Edit a draft version's content. Only draft rows are editable — promoted /
 * archived rows are immutable (throws `CannotEditPublishedVersion`).
 */
export function updateDraftVersion(
  db: FoodDb,
  versionId: number,
  input: UpdateDraftVersionInput
): RecipeVersionRow {
  return db.transaction((tx) => {
    const current = tx
      .select({ status: recipeVersions.status })
      .from(recipeVersions)
      .where(eq(recipeVersions.id, versionId))
      .all();
    const row = current[0];
    if (row === undefined) {
      throw new Error(`recipe_version #${versionId} not found`);
    }
    if (row.status !== 'draft') {
      throw new CannotEditPublishedVersion(versionId);
    }
    const updated = tx
      .update(recipeVersions)
      .set(input)
      .where(eq(recipeVersions.id, versionId))
      .returning()
      .all();
    return expectRow(updated, `updateDraftVersion(${versionId})`);
  });
}

export function archiveVersion(db: FoodDb, versionId: number): RecipeVersionRow {
  const rows = db
    .update(recipeVersions)
    .set({ status: 'archived' })
    .where(eq(recipeVersions.id, versionId))
    .returning()
    .all();
  return expectRow(rows, `archiveVersion(${versionId})`);
}

/**
 * Promote a draft to `current` atomically: archives any previously-current
 * version, sets the new one to current, updates `recipes.current_version_id`.
 *
 * Refuses to promote a version whose `compile_status` is not `'compiled'`
 * (throws `CannotPromoteUncompiledVersion`). On a partial-UNIQUE conflict
 * from a concurrent promotion, throws `ConcurrentPromotion` instead of
 * surfacing the bare SQLite error.
 */
export function promoteVersion(db: FoodDb, versionId: number): RecipeVersionRow {
  return db.transaction((tx) => {
    const existing = tx
      .select({
        id: recipeVersions.id,
        recipeId: recipeVersions.recipeId,
        status: recipeVersions.status,
        compileStatus: recipeVersions.compileStatus,
      })
      .from(recipeVersions)
      .where(eq(recipeVersions.id, versionId))
      .all();
    const target = existing[0];
    if (target === undefined) {
      throw new Error(`recipe_version #${versionId} not found`);
    }
    if (target.compileStatus !== 'compiled') {
      throw new CannotPromoteUncompiledVersion(
        versionId,
        target.compileStatus as 'uncompiled' | 'failed'
      );
    }
    if (target.status === 'current') {
      // Idempotent re-promotion — return the already-current row.
      const row = tx.select().from(recipeVersions).where(eq(recipeVersions.id, versionId)).all();
      return expectRow(row, `promoteVersion(${versionId}) idempotent`);
    }
    // Archive any other version currently set to 'current' for this recipe.
    tx.update(recipeVersions)
      .set({ status: 'archived' })
      .where(
        and(eq(recipeVersions.recipeId, target.recipeId), eq(recipeVersions.status, 'current'))
      )
      .run();
    try {
      tx.update(recipeVersions)
        .set({ status: 'current' })
        .where(eq(recipeVersions.id, versionId))
        .run();
    } catch (err) {
      // Partial UNIQUE on (recipe_id) WHERE status='current' fires here when
      // another tx beat us. Map to typed error.
      if (isUniqueConstraintError(err)) {
        throw new ConcurrentPromotion(target.recipeId);
      }
      throw err;
    }
    tx.update(recipes)
      .set({ currentVersionId: versionId })
      .where(eq(recipes.id, target.recipeId))
      .run();
    const final = tx.select().from(recipeVersions).where(eq(recipeVersions.id, versionId)).all();
    return expectRow(final, `promoteVersion(${versionId})`);
  });
}

function isUniqueConstraintError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT';
}
