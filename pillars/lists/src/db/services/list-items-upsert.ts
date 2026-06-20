/**
 * Atomic merge-or-insert keyed on `(listId, refKind, refId)`. `refKind`
 * cannot be `'free'` — `'free'` rows have no identity and so can't be
 * deduplicated.
 *
 * On conflict:
 *   - `'merge-additive'` (default): qty = existing.qty + new.qty (null = 0);
 *     notes = existing.notes ? `${existing.notes}\n${new.notes}` : new.notes;
 *     label replaced; unit kept.
 *   - `'replace'`: existing row's label/qty/unit/notes replaced wholesale.
 *   - `'skip'`: no-op; existing row left as-is.
 *
 * Notes-on-merge uses `\n` (newline) as the universal separator and never
 * truncates. Callers wanting domain-specific note formatting (separators,
 * caps) should compose with `updateItem` after the upsert.
 */
import { and, eq } from 'drizzle-orm';

import { listItems, type ListItemRefKind, type ListItemRow } from '../schema.js';
import { expectRow, type ListsDb, nextPosition } from './internal.js';

export type UpsertConflictMode = 'merge-additive' | 'replace' | 'skip';
export type UpsertRefKind = Exclude<ListItemRefKind, 'free'>;

export interface UpsertItemByRefInput {
  listId: number;
  refKind: UpsertRefKind;
  refId: number;
  label: string;
  qty?: number | null;
  unit?: string | null;
  notes?: string | null;
  onConflict?: UpsertConflictMode;
}

export type UpsertOutcome =
  | { outcome: 'inserted'; itemId: number; position: number }
  | { outcome: 'merged'; itemId: number }
  | { outcome: 'skipped'; itemId: number };

export function upsertItemByRef(db: ListsDb, input: UpsertItemByRefInput): UpsertOutcome {
  const mode: UpsertConflictMode = input.onConflict ?? 'merge-additive';
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(listItems)
      .where(
        and(
          eq(listItems.listId, input.listId),
          eq(listItems.refKind, input.refKind),
          eq(listItems.refId, input.refId)
        )
      )
      .limit(1)
      .all()[0];

    if (existing === undefined) {
      const position = nextPosition(tx, input.listId);
      const inserted = expectRow(
        tx
          .insert(listItems)
          .values({
            listId: input.listId,
            refKind: input.refKind,
            refId: input.refId,
            label: input.label,
            qty: input.qty ?? null,
            unit: input.unit ?? null,
            notes: input.notes ?? null,
            position,
          })
          .returning()
          .all(),
        'upsertItemByRef.insert'
      );
      return { outcome: 'inserted', itemId: inserted.id, position: inserted.position };
    }

    if (mode === 'skip') {
      return { outcome: 'skipped', itemId: existing.id };
    }

    const merged = mergedValues(existing, input, mode);
    tx.update(listItems).set(merged).where(eq(listItems.id, existing.id)).run();
    return { outcome: 'merged', itemId: existing.id };
  });
}

interface MergedValues {
  label: string;
  qty: number | null;
  unit: string | null;
  notes: string | null;
}

function mergedValues(
  existing: ListItemRow,
  input: UpsertItemByRefInput,
  mode: 'merge-additive' | 'replace'
): MergedValues {
  if (mode === 'replace') {
    return {
      label: input.label,
      qty: input.qty ?? null,
      unit: input.unit ?? null,
      notes: input.notes ?? null,
    };
  }
  const newQty = (existing.qty ?? 0) + (input.qty ?? 0);
  const newNotes = mergeNotes(existing.notes, input.notes ?? null);
  return {
    label: input.label,
    qty: input.qty === null && existing.qty === null ? null : newQty,
    unit: existing.unit ?? input.unit ?? null,
    notes: newNotes,
  };
}

function mergeNotes(existing: string | null, addition: string | null): string | null {
  if (addition === null || addition === '') return existing;
  if (existing === null || existing === '') return addition;
  return `${existing}\n${addition}`;
}
