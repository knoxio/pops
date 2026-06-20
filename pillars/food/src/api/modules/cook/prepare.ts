import { PrepareCookError } from './prepare-error.js';
import {
  loadConsumeNeeds,
  loadVersion,
  resolvePlanContext,
  resolveYieldDefault,
} from './prepare-loaders.js';

/**
 * `food.cook.prepareCook` — pre-flight query that powers the cook modal's
 * initial render. Returns recipe + yield default + per-line consumption
 * needs at `scaleFactor=1`; the client multiplies as the user adjusts.
 *
 * See PRD-144 §`prepareCook` server-side flow.
 */
import type { FoodDb } from '../../../db/index.js';
import type { CookPreparation } from '../../../domain/types/cook.js';

export { PrepareCookError };

export interface PrepareCookArgs {
  recipeVersionId: number;
  planEntryId?: number;
}

export function prepareCook(db: FoodDb, args: PrepareCookArgs): CookPreparation {
  const versionRow = loadVersion(db, args.recipeVersionId);
  if (versionRow === null) throw new PrepareCookError('RecipeVersionNotFound');

  const planContext = resolvePlanContext(db, args.planEntryId);
  const yieldDefault = resolveYieldDefault(db, versionRow);
  const consumeNeeds = loadConsumeNeeds(db, versionRow.id);

  return {
    recipeTitle: versionRow.title,
    recipeSlug: versionRow.slug,
    versionNo: versionRow.versionNo,
    defaultScaleFactor: planContext.defaultScaleFactor,
    yieldsBatch: yieldDefault !== null,
    yieldDefault,
    consumeNeeds,
    alreadyCooked: planContext.alreadyCooked,
  };
}
