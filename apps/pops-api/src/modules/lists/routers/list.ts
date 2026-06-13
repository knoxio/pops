/**
 * `lists.list.*` — header-level CRUD procedures (PRD-140).
 *
 * `list` (the index page query) is the router-owned aggregate that joins
 * `lists` to `list_items` so the page gets `itemCount` / `uncheckedCount` /
 * `lastUpdatedAt` in one round-trip. Every other procedure is a thin
 * transactional pass-through to PRD-112 services in `@pops/app-lists-db`.
 *
 * Track K phase 1 PR 3 cutover: the `listItemsForList` read used by `get`
 * now resolves through the canonical `@pops/lists-db` package. The `lists`-
 * header surface (createList / getList / updateList / etc.) and the
 * `ListNotFoundError` typed error stay on `@pops/app-lists-db` until the
 * next slice migrates the `lists` CRUD services across.
 *
 * Track K phase 2 PR 3 cutover: the DB handle now comes from
 * `getListsDrizzle()` (the lists pillar's `lists.db`) instead of the
 * shared `getDrizzle()` core handle. Theme 13 PR 4 retired the
 * boot-time ATTACH bridge from the shared `pops.db` — every `lists` +
 * `list_items` write now lands directly in `lists.db`.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  archiveList,
  createList,
  deleteList,
  getList,
  ListNotFoundError,
  unarchiveList,
  updateList,
} from '@pops/app-lists-db';
import { listItemsService } from '@pops/lists-db';

import { getListsDrizzle } from '../../../db/lists-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { selectListAggregate } from '../services/aggregate.js';
import { runOrMap } from './error-mapping.js';

const KIND_ENUM = z.enum(['shopping', 'packing', 'todo', 'generic']);
const SORT_ENUM = z.enum(['updated', 'name', 'created']);

const ListInputSchema = z
  .object({
    kinds: z.array(KIND_ENUM).optional(),
    includeArchived: z.boolean().optional(),
    sort: SORT_ENUM.optional(),
  })
  .optional();

const GetInputSchema = z.object({ id: z.number().int().positive() });

const CreateInputSchema = z.object({
  name: z.string().trim().min(1, 'NameRequired'),
  kind: KIND_ENUM,
  ownerApp: z.string().trim().min(1).optional(),
});

const UpdateInputSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).optional(),
    kind: KIND_ENUM.optional(),
  })
  .refine((v) => v.name !== undefined || v.kind !== undefined, {
    message: 'patch must include name or kind',
  });

const IdInputSchema = z.object({ id: z.number().int().positive() });

export const listRouter = router({
  /** Aggregate list query for the /lists index page. */
  list: protectedProcedure.input(ListInputSchema).query(({ input }) => {
    const items = selectListAggregate(getListsDrizzle(), input ?? {});
    return { items };
  }),

  /**
   * Fetch a single list header + its items in one round-trip — the main
   * query backing /lists/:id. Returns `null` for an unknown id rather than
   * throwing because the detail page renders an empty state when the list
   * was just deleted in another tab; throwing `NOT_FOUND` would surface as
   * a generic error toast instead.
   */
  get: protectedProcedure.input(GetInputSchema).query(({ input }) => {
    const db = getListsDrizzle();
    const list = getList(db, input.id);
    if (list === null) return null;
    const items = listItemsService.listItemsForList(db, input.id);
    return { list, items };
  }),

  create: protectedProcedure.input(CreateInputSchema).mutation(({ input }) => {
    const row = runOrMap(() =>
      createList(getListsDrizzle(), {
        name: input.name,
        kind: input.kind,
        ownerApp: input.ownerApp ?? 'user',
      })
    );
    return { id: row.id };
  }),

  /**
   * Update name or kind. Returns a discriminated result so the UI can
   * distinguish `NameRequired` (handled by Zod input refinement) from
   * `NotFound` without a thrown TRPCError that would surface as a toast.
   */
  update: protectedProcedure.input(UpdateInputSchema).mutation(({ input }) => {
    try {
      updateList(getListsDrizzle(), input.id, { name: input.name, kind: input.kind });
      return { ok: true as const };
    } catch (err) {
      if (err instanceof ListNotFoundError) {
        return { ok: false as const, reason: 'NotFound' as const };
      }
      throw err;
    }
  }),

  archive: protectedProcedure.input(IdInputSchema).mutation(({ input }) => {
    runOrMap(() => archiveList(getListsDrizzle(), input.id));
    return { ok: true as const };
  }),

  unarchive: protectedProcedure.input(IdInputSchema).mutation(({ input }) => {
    runOrMap(() => unarchiveList(getListsDrizzle(), input.id));
    return { ok: true as const };
  }),

  delete: protectedProcedure.input(IdInputSchema).mutation(({ input }) => {
    const db = getListsDrizzle();
    // PRD-140 line 213: cascade items via PRD-112's `deleteList` (one
    // transaction). The service is intentionally idempotent on unknown id,
    // but we throw NOT_FOUND if the row was never there so the UI can show
    // a useful message instead of silently succeeding.
    const existing = getList(db, input.id);
    if (existing === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `List #${input.id} not found` });
    }
    runOrMap(() => deleteList(db, input.id));
    return { ok: true as const };
  }),
});
