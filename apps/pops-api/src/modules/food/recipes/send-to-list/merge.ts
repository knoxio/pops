/**
 * Per-item merge / insert helpers for PRD-142's send loop.
 *
 * `tryMergeItem` looks for an existing list_items row with matching
 * `(ref_kind, ref_id)`; on hit it bumps qty + appends to notes + rebuilds
 * the label. On miss it inserts a fresh row via PRD-112's `addItem` so
 * position auto-assign + normalisation stay centralised.
 */
import { and, eq } from 'drizzle-orm';

import { addItem, type ListsDb, listItems } from '@pops/app-lists-db';

import { appendNote, MAX_NOTES_LENGTH } from './notes-helpers.js';
import { relabelAfterMerge, type SendItem } from './send-items.js';

export interface MergeOutcome {
  kind: 'merged' | 'inserted';
}

export function processItem(
  tx: ListsDb,
  listId: number,
  item: SendItem,
  recipeTitle: string
): MergeOutcome {
  const noteForThisSend = buildNoteFragment(recipeTitle, item.prepLabel);
  if (item.mergeable && item.refId !== null) {
    const existing = findExistingMatch(tx, listId, item.refKind, item.refId);
    if (existing !== undefined) {
      mergeIntoExisting(tx, existing, item, noteForThisSend);
      return { kind: 'merged' };
    }
  }
  insertFresh(tx, listId, item, noteForThisSend);
  return { kind: 'inserted' };
}

interface ExistingRow {
  id: number;
  qty: number | null;
  notes: string | null;
}

function findExistingMatch(
  tx: ListsDb,
  listId: number,
  refKind: 'ingredient' | 'variant' | 'free',
  refId: number
): ExistingRow | undefined {
  if (refKind === 'free') return undefined;
  const rows = tx
    .select({ id: listItems.id, qty: listItems.qty, notes: listItems.notes })
    .from(listItems)
    .where(
      and(eq(listItems.listId, listId), eq(listItems.refKind, refKind), eq(listItems.refId, refId))
    )
    .limit(1)
    .all();
  return rows[0];
}

function mergeIntoExisting(
  tx: ListsDb,
  existing: ExistingRow,
  item: SendItem,
  noteFragment: string
): void {
  const previewQty = item.preview.qty ?? 0;
  const newQty = (existing.qty ?? 0) + previewQty;
  const newNotes = appendNote(existing.notes, noteFragment).slice(0, MAX_NOTES_LENGTH);
  tx.update(listItems)
    .set({
      qty: newQty,
      notes: newNotes,
      label: relabelAfterMerge(item, newQty),
    })
    .where(eq(listItems.id, existing.id))
    .run();
}

function insertFresh(tx: ListsDb, listId: number, item: SendItem, noteFragment: string): void {
  addItem(tx, {
    listId,
    label: item.preview.label,
    qty: item.preview.qty,
    unit: item.preview.unit,
    refKind: item.refKind,
    refId: item.refId,
    notes: noteFragment,
  });
}

/**
 * `<recipe title>` or `<recipe title> (<prep>)` — short, human-readable
 * fragment used by both merge appends and fresh inserts. Caller pipes the
 * fragment through `appendNote` for merges (handles separator + truncation).
 */
function buildNoteFragment(recipeTitle: string, prepLabel: string | null): string {
  if (prepLabel === null || prepLabel === '') return recipeTitle;
  return `${recipeTitle} (${prepLabel})`;
}
