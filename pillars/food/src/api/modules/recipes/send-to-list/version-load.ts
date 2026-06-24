/**
 * Shared version-loading helper for the prepare + send flows.
 *
 * Both procedures need the version row + parent recipe slug + a
 * compile-status check. Returning a discriminated result lets the caller
 * map to either `SendToListError` (send) or throw `HttpError` (prepare).
 */
import { eq } from 'drizzle-orm';

import { type FoodDb, recipes, recipeVersions } from '../../../../db/index.js';

export interface LoadedVersion {
  versionId: number;
  recipeId: number;
  title: string;
  recipeSlug: string;
}

export type LoadVersionResult =
  | { ok: true; version: LoadedVersion }
  | { ok: false; reason: 'RecipeNotFound' | 'CompileNotReady' };

export function loadVersionForSend(db: FoodDb, versionId: number): LoadVersionResult {
  const v = db.select().from(recipeVersions).where(eq(recipeVersions.id, versionId)).all()[0];
  if (v === undefined) return { ok: false, reason: 'RecipeNotFound' };
  if (v.compileStatus !== 'compiled') return { ok: false, reason: 'CompileNotReady' };
  const recipe = db.select().from(recipes).where(eq(recipes.id, v.recipeId)).all()[0];
  if (recipe === undefined) return { ok: false, reason: 'RecipeNotFound' };
  return {
    ok: true,
    version: {
      versionId: v.id,
      recipeId: v.recipeId,
      title: v.title,
      recipeSlug: recipe.slug,
    },
  };
}

/** Clamp scale factor: defaults to 1, 0/negative/non-finite → 1. */
export function clampScaleFactor(scale: number | undefined): number {
  if (scale === undefined || scale <= 0 || !Number.isFinite(scale)) return 1;
  return scale;
}
