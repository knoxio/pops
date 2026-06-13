/**
 * `food.recipes.sendToList` server logic — PRD-142.
 *
 * Discriminated result (`{ ok:true, ... } | { ok:false, reason }`) so the
 * router can surface validation failures without a tRPCError surface (the
 * UI's modal stays open and shows the inline error). The transactional
 * insert/merge loop runs inside a single Drizzle transaction per PRD §AC.
 */
import { type FoodDb } from '@pops/app-food-db';
import { type ListsDb } from '@pops/app-lists-db';

import { aggregateLinesForSend } from './aggregate.js';
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

export function sendToList(
  foodDb: FoodDb,
  listsDb: ListsDb,
  input: SendToListInput
): SendToListResult {
  const loaded = loadVersionForSend(foodDb, input.versionId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const scaleFactor = clampScaleFactor(input.scaleFactor);
  const aggregate = aggregateLinesForSend(foodDb, input.versionId, scaleFactor);
  const items = buildSendItems(aggregate);
  if (items.length === 0) return { ok: false, reason: 'NoIngredients' };
  return listsDb.transaction((tx) => writeItems(tx, items, input.target, loaded.version.title));
}

function writeItems(
  tx: ListsDb,
  items: readonly SendItem[],
  target: SendTarget,
  recipeTitle: string
): SendToListResult {
  const resolved = resolveTarget(tx, target);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  let added = 0;
  let merged = 0;
  for (const item of items) {
    const outcome = processItem(tx, resolved.listId, item, recipeTitle);
    if (outcome.kind === 'merged') merged += 1;
    else added += 1;
  }
  return { ok: true, listId: resolved.listId, addedCount: added, mergedCount: merged };
}
