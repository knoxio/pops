/**
 * `food.recipes.prepareSendToList` server logic — PRD-142.
 *
 * Returns the preview the modal renders. Throws `TRPCError(NOT_FOUND)` for
 * unknown versions and `TRPCError(FAILED_PRECONDITION)` for uncompiled
 * versions. The send-side procedure uses the same internal aggregation but
 * maps errors onto the discriminated `SendToListError` union instead.
 */
import { TRPCError } from '@trpc/server';

import { type FoodDb } from '@pops/app-food-db';
import { type ListsDb } from '@pops/app-lists-db';

import { aggregateLinesForSend } from './aggregate.js';
import { findListsAlreadyMentioning } from './already-sent.js';
import { buildCanonicalItem, buildUnconvertedItem } from './label.js';
import { type SendPreview } from './types.js';
import { clampScaleFactor, loadVersionForSend } from './version-load.js';

export function prepareSendToList(
  foodDb: FoodDb,
  listsDb: ListsDb,
  versionId: number,
  scaleFactorIn: number | undefined
): SendPreview {
  const loaded = loadVersionForSend(foodDb, versionId);
  if (!loaded.ok) {
    if (loaded.reason === 'CompileNotReady') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Recipe version ${versionId} is not compiled`,
      });
    }
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Recipe version ${versionId} not found`,
    });
  }
  const scaleFactor = clampScaleFactor(scaleFactorIn);
  const aggregate = aggregateLinesForSend(foodDb, versionId, scaleFactor);
  const canonicalItems = aggregate.canonical.map(buildCanonicalItem);
  const unconvertedItems = aggregate.unconverted.map(buildUnconvertedItem);
  return {
    recipeTitle: loaded.version.title,
    scaleFactor,
    canonicalItems,
    unconvertedItems,
    alreadySentToListIds: findListsAlreadyMentioning(listsDb, loaded.version.title),
  };
}
