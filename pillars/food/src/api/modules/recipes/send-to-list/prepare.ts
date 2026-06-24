/**
 * `recipes.prepareSendToList` server logic.
 *
 * Returns the preview the modal renders. Throws `HttpError(404)` for unknown
 * versions and `HttpError(400)` for uncompiled ones. The send-side procedure
 * uses the same internal aggregation but maps errors onto the discriminated
 * `SendToListError` union instead. The "already sent" lookup hits the lists
 * REST API.
 */
import { type FoodDb } from '../../../../db/index.js';
import { HttpError } from '../../../shared/errors.js';
import { aggregateLinesForSend } from './aggregate.js';
import { findListsAlreadyMentioning } from './already-sent.js';
import { buildCanonicalItem, buildUnconvertedItem } from './label.js';
import { type ListsClient } from './lists-client.js';
import { type SendPreview } from './types.js';
import { clampScaleFactor, loadVersionForSend } from './version-load.js';

export async function prepareSendToList(
  foodDb: FoodDb,
  client: ListsClient,
  versionId: number,
  scaleFactorIn: number | undefined
): Promise<SendPreview> {
  const loaded = loadVersionForSend(foodDb, versionId);
  if (!loaded.ok) {
    if (loaded.reason === 'CompileNotReady') {
      throw new HttpError(
        400,
        `Recipe version ${versionId} is not compiled`,
        undefined,
        'common.validationFailed'
      );
    }
    throw new HttpError(404, `Recipe version ${versionId} not found`, undefined, 'common.notFound');
  }
  const scaleFactor = clampScaleFactor(scaleFactorIn);
  const aggregate = aggregateLinesForSend(foodDb, versionId, scaleFactor);
  return {
    recipeTitle: loaded.version.title,
    scaleFactor,
    canonicalItems: aggregate.canonical.map(buildCanonicalItem),
    unconvertedItems: aggregate.unconverted.map(buildUnconvertedItem),
    alreadySentToListIds: await findListsAlreadyMentioning(client, loaded.version.title),
  };
}
