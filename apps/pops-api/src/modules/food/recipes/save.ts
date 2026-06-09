/**
 * Save / promote / archive flows — PRD-119.
 *
 * Thin wrappers around PRD-107's recipe + version services. The compile
 * step on `saveDraft` is what feeds the editor's error squiggles
 * (PRD-120-C `issues` prop).
 */
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import {
  compileRecipeVersion,
  recipes,
  recipesService,
  recipeVersionsService,
  type FoodDb,
} from '@pops/app-food-db';

import { mapPromoteError, mapSaveDraftError } from './error-mapping.js';

import type { PromoteResult, SaveDraftResult } from './types.js';

const { archiveRecipe } = recipesService;
const { archiveVersion, promoteVersion, updateDraftVersion } = recipeVersionsService;

export function saveDraft(db: FoodDb, versionId: number, dsl: string): SaveDraftResult {
  try {
    updateDraftVersion(db, versionId, { bodyDsl: dsl });
  } catch (err) {
    mapSaveDraftError(err);
  }
  const compile = compileRecipeVersion(versionId, db);
  return { compile };
}

export function promote(db: FoodDb, versionId: number): PromoteResult {
  try {
    const promoted = promoteVersion(db, versionId);
    return { ok: true, versionId: promoted.id };
  } catch (err) {
    return mapPromoteError(err);
  }
}

export function archiveVersionRow(db: FoodDb, versionId: number): { ok: true } {
  archiveVersion(db, versionId);
  return { ok: true };
}

export function archiveRecipeBySlug(db: FoodDb, slug: string): { ok: true } {
  const row = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, slug)).all()[0];
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Recipe "${slug}" not found` });
  }
  archiveRecipe(db, row.id);
  return { ok: true };
}
