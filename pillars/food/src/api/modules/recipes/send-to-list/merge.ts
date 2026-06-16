/**
 * Per-item merge / insert for PRD-142's send loop, over the lists REST API.
 *
 * Mergeable (ingredient/variant) items go through `upsert-by-ref` with
 * `onConflict='merge-additive'` — the lists pillar atomically sums qty +
 * merges notes by `(refKind, refId)`. Unconverted ("free") lines always
 * insert fresh (they have no ref to merge on).
 */
import { type ListsClient } from './lists-client.js';
import { type SendItem } from './send-items.js';

export interface MergeOutcome {
  kind: 'merged' | 'inserted';
}

export async function processItem(
  client: ListsClient,
  listId: number,
  item: SendItem,
  recipeTitle: string
): Promise<MergeOutcome> {
  const notes = buildNoteFragment(recipeTitle, item.prepLabel);
  if (item.mergeable && item.refId !== null && item.refKind !== 'free') {
    const res = await client.upsertByRef(listId, {
      refKind: item.refKind,
      refId: item.refId,
      label: item.preview.label,
      qty: item.preview.qty,
      unit: item.preview.unit,
      notes,
      onConflict: 'merge-additive',
    });
    return { kind: res.outcome === 'merged' ? 'merged' : 'inserted' };
  }
  await client.addItem(listId, {
    label: item.preview.label,
    qty: item.preview.qty,
    unit: item.preview.unit,
    refKind: 'free',
    refId: null,
    notes,
  });
  return { kind: 'inserted' };
}

/**
 * `<recipe title>` or `<recipe title> (<prep>)` — short note fragment
 * recorded against each list item so the "already sent" search can find it.
 */
function buildNoteFragment(recipeTitle: string, prepLabel: string | null): string {
  if (prepLabel === null || prepLabel === '') return recipeTitle;
  return `${recipeTitle} (${prepLabel})`;
}
