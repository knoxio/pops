/**
 * `lists.items.*` — item-level CRUD procedures (PRD-140).
 *
 * Thin transactional wrappers around the PRD-112 service layer in
 * `@pops/app-lists-db`. The router contributes:
 *   - `reorder` count-mismatch defence (rejects stale-state writes).
 *   - `check` returning a deterministic `checkedAt` ISO timestamp so the
 *     UI's optimistic update can rehydrate without a refetch.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  addItem,
  bulkAdd,
  checkItem,
  type ListsDb,
  listItemsForList,
  removeItem,
  reorderItems,
  uncheckItem,
  updateItem,
} from '@pops/app-lists-db';

import { getDrizzle } from '../../../db.js';
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

function currentItemIds(db: ListsDb, listId: number): readonly number[] {
  return listItemsForList(db, listId).map((r) => r.id);
}

export const itemsRouter = router({
  add: protectedProcedure.input(AddInputSchema).mutation(({ input }) => {
    const row = runOrMap(() => addItem(getDrizzle(), input));
    return { id: row.id, position: row.position };
  }),

  bulkAdd: protectedProcedure.input(BulkAddInputSchema).mutation(({ input }) => {
    const rows = runOrMap(() => bulkAdd(getDrizzle(), input.listId, input.items));
    return { addedIds: rows.map((r) => r.id) };
  }),

  update: protectedProcedure.input(UpdateInputSchema).mutation(({ input }) => {
    runOrMap(() => updateItem(getDrizzle(), input.id, input));
    return { ok: true as const };
  }),

  check: protectedProcedure.input(IdInputSchema).mutation(({ input }) => {
    const row = runOrMap(() => checkItem(getDrizzle(), input.id));
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
    runOrMap(() => uncheckItem(getDrizzle(), input.id));
    return { ok: true as const };
  }),

  remove: protectedProcedure.input(IdInputSchema).mutation(({ input }) => {
    // PRD-112's removeItem is idempotent (no NotFound). Always returns ok.
    runOrMap(() => removeItem(getDrizzle(), input.id));
    return { ok: true as const };
  }),

  /**
   * Reorder validates count parity AND id-set parity against the current
   * items. PRD-140 §AC explicitly calls out the count check; the id-set
   * check is a tighter version of the same defence (catches "5 items but
   * one of them is from a different list").
   */
  reorder: protectedProcedure.input(ReorderInputSchema).mutation(({ input }) => {
    const db = getDrizzle();
    const current = currentItemIds(db, input.listId);
    if (current.length !== input.orderedIds.length) {
      return { ok: false as const, reason: 'BadIds' as const };
    }
    const currentSet = new Set(current);
    for (const id of input.orderedIds) {
      if (!currentSet.has(id)) return { ok: false as const, reason: 'BadIds' as const };
    }
    runOrMap(() => reorderItems(db, input.listId, input.orderedIds));
    return { ok: true as const };
  }),
});
