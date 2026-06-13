/**
 * `lists.items.*` — item-level CRUD procedures (PRD-140).
 *
 * Thin transactional wrappers around the PRD-112 service layer. The router
 * contributes:
 *   - `reorder` count-mismatch defence (rejects stale-state writes).
 *   - `check` returning a deterministic `checkedAt` ISO timestamp so the
 *     UI's optimistic update can rehydrate without a refetch.
 *
 * Track K phase 1 PR 3 cutover: the `list_items` read + check-state surface
 * (`listItemsForList`, `checkListItem`, `uncheckListItem`,
 * `uncheckAllListItems`) now resolves through the canonical
 * `@pops/lists-db` package. The remaining mutations (`addItem`, `bulkAdd`,
 * `updateItem`, `removeItem`, `reorderItems`, `removeCheckedItems`) stay on
 * `@pops/app-lists-db` until a follow-up slice migrates the position-
 * allocation + ref-kind helpers across.
 *
 * Track K phase 2 PR 3 cutover: the DB handle every call site receives
 * now comes from `getListsDrizzle()` (the lists pillar's `lists.db`)
 * instead of the shared `getDrizzle()` core handle. Theme 13 PR 4
 * retired the boot-time ATTACH bridge from the shared `pops.db` — every
 * `lists` + `list_items` write now lands directly in `lists.db`. The
 * mix of `@pops/lists-db` (reads + check-state) and `@pops/app-lists-db`
 * (writes still pending slice migration) both accept the same
 * structural `ListsDb` drizzle type, so the single handle change covers
 * both packages.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  addItem,
  bulkAdd,
  type ListsDb,
  removeCheckedItems,
  removeItem,
  reorderItems,
  updateItem,
} from '@pops/app-lists-db';
import { listItemsService } from '@pops/lists-db';

import { getListsDrizzle } from '../../../db/lists-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { runOrMap } from './error-mapping.js';

const REF_KIND_ENUM = z.enum(['free', 'ingredient', 'variant', 'recipe', 'custom']);

const ItemAddInputSchema = z.object({
  label: z.string().trim().min(1),
  qty: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  refKind: REF_KIND_ENUM.optional(),
  refId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  /** PRD-152 amendment to PRD-140 — optional explicit position. */
  position: z.number().int().nonnegative().optional(),
});

const AddInputSchema = ItemAddInputSchema.extend({
  listId: z.number().int().positive(),
});

const BulkAddInputSchema = z.object({
  listId: z.number().int().positive(),
  items: z.array(ItemAddInputSchema).min(1),
});

const UpdateInputSchema = z
  .object({
    id: z.number().int().positive(),
    label: z.string().trim().min(1).optional(),
    qty: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.label !== undefined || v.qty !== undefined || v.unit !== undefined || v.notes !== undefined,
    { message: 'patch must include at least one field besides id' }
  );

const IdInputSchema = z.object({ id: z.number().int().positive() });

const ReorderInputSchema = z.object({
  listId: z.number().int().positive(),
  orderedIds: z.array(z.number().int().positive()),
});

const ListIdInputSchema = z.object({ listId: z.number().int().positive() });

function currentItemIds(db: ListsDb, listId: number): readonly number[] {
  return listItemsService.listItemsForList(db, listId).map((r) => r.id);
}

export const itemsRouter = router({
  add: protectedProcedure.input(AddInputSchema).mutation(({ input }) => {
    const row = runOrMap(() => addItem(getListsDrizzle(), input));
    return { id: row.id, position: row.position };
  }),

  bulkAdd: protectedProcedure.input(BulkAddInputSchema).mutation(({ input }) => {
    const rows = runOrMap(() => bulkAdd(getListsDrizzle(), input.listId, input.items));
    return { addedIds: rows.map((r) => r.id) };
  }),

  update: protectedProcedure.input(UpdateInputSchema).mutation(({ input }) => {
    runOrMap(() => updateItem(getListsDrizzle(), input.id, input));
    return { ok: true as const };
  }),

  check: protectedProcedure.input(IdInputSchema).mutation(({ input }) => {
    const row = runOrMap(() => listItemsService.checkListItem(getListsDrizzle(), input.id));
    if (row.checkedAt === null) {
      // PRD-112 enforces `checked_at` is set when `checked=1` — this branch
      // is defensive against a future schema change.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'check succeeded but checkedAt is null',
      });
    }
    return { ok: true as const, checkedAt: row.checkedAt };
  }),

  uncheck: protectedProcedure.input(IdInputSchema).mutation(({ input }) => {
    runOrMap(() => listItemsService.uncheckListItem(getListsDrizzle(), input.id));
    return { ok: true as const };
  }),

  remove: protectedProcedure.input(IdInputSchema).mutation(({ input }) => {
    // PRD-112's removeItem is idempotent (no NotFound). Always returns ok.
    runOrMap(() => removeItem(getListsDrizzle(), input.id));
    return { ok: true as const };
  }),

  /**
   * Reorder enforces that `orderedIds` is a true permutation of the current
   * item IDs: same length, every id belongs to the list, AND no duplicates.
   * The duplicate check matters — without it `[a, a, b]` would pass the
   * length + membership checks and silently update item `a`'s position
   * twice while leaving the third item stranded at its old position.
   * PRD-140 §AC calls out the count check; the id-set + uniqueness checks
   * are tighter versions of the same defence.
   */
  reorder: protectedProcedure.input(ReorderInputSchema).mutation(({ input }) => {
    const db = getListsDrizzle();
    const current = currentItemIds(db, input.listId);
    if (current.length !== input.orderedIds.length) {
      return { ok: false as const, reason: 'BadIds' as const };
    }
    const orderedSet = new Set(input.orderedIds);
    if (orderedSet.size !== input.orderedIds.length) {
      return { ok: false as const, reason: 'BadIds' as const };
    }
    const currentSet = new Set(current);
    for (const id of input.orderedIds) {
      if (!currentSet.has(id)) return { ok: false as const, reason: 'BadIds' as const };
    }
    runOrMap(() => reorderItems(db, input.listId, input.orderedIds));
    return { ok: true as const };
  }),

  /**
   * Bulk-uncheck every checked item in a list (PRD-141 amendment). Returns
   * the affected row count so the UI can surface "Unchecked N items"
   * without a follow-up read.
   */
  uncheckAll: protectedProcedure.input(ListIdInputSchema).mutation(({ input }) => {
    const count = runOrMap(() =>
      listItemsService.uncheckAllListItems(getListsDrizzle(), input.listId)
    );
    return { ok: true as const, count };
  }),

  /**
   * Hard-delete every checked item in a list (PRD-141 amendment). Returns
   * the row count removed; unchecked items are untouched.
   */
  removeChecked: protectedProcedure.input(ListIdInputSchema).mutation(({ input }) => {
    const removedCount = runOrMap(() => removeCheckedItems(getListsDrizzle(), input.listId));
    return { ok: true as const, removedCount };
  }),
});
