/**
 * `recipes.sendToList` server logic, over the lists REST API. Discriminated
 * result so the handler surfaces validation failures inline. Each item is its
 * own atomic `upsert-by-ref`/`add` call; there is no single cross-pillar
 * transaction (lists owns its consistency).
 */
import { type FoodDb } from '../../../../db/index.js';
import { aggregateLinesForSend } from './aggregate.js';
import { type ListsClient } from './lists-client.js';
import { processItem } from './merge.js';
import { buildSendItems, type SendItem } from './send-items.js';
import { resolveTarget } from './target-resolve.js';
import { type SendTarget, type SendToListResult } from './types.js';
import { clampScaleFactor, loadVersionForSend } from './version-load.js';

export interface SendToListInput {
  versionId: number;
  scaleFactor?: number;
  target: SendTarget;
}

export async function sendToList(
  foodDb: FoodDb,
  client: ListsClient,
  input: SendToListInput
): Promise<SendToListResult> {
  const loaded = loadVersionForSend(foodDb, input.versionId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const scaleFactor = clampScaleFactor(input.scaleFactor);
  const aggregate = aggregateLinesForSend(foodDb, input.versionId, scaleFactor);
  const items = buildSendItems(aggregate);
  if (items.length === 0) return { ok: false, reason: 'NoIngredients' };
  return writeItems(client, items, input.target, loaded.version.title);
}

async function writeItems(
  client: ListsClient,
  items: readonly SendItem[],
  target: SendTarget,
  recipeTitle: string
): Promise<SendToListResult> {
  const resolved = await resolveTarget(client, target);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  let added = 0;
  let merged = 0;
  for (const item of items) {
    const outcome = await processItem(client, resolved.listId, item, recipeTitle);
    if (outcome.kind === 'merged') merged += 1;
    else added += 1;
  }
  return { ok: true, listId: resolved.listId, addedCount: added, mergedCount: merged };
}
