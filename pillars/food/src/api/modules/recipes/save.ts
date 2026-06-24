/**
 * Save / promote / archive flows.
 *
 * Thin wrappers around the recipe + version services. The compile step on
 * `saveDraft` is what feeds the editor's error squiggles (`issues` prop).
 */
import { eq } from 'drizzle-orm';

import { recipes, recipesService, recipeVersionsService, type FoodDb } from '../../../db/index.js';
import { compileRecipeVersion } from '../../../dsl/compile.js';
import { NotFoundError } from '../../shared/errors.js';
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
    const result = promoteVersion(db, versionId);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    return { ok: true, versionId: result.row.id };
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
  if (row === undefined) throw new NotFoundError('Recipe', slug);
  archiveRecipe(db, row.id);
  return { ok: true };
}
