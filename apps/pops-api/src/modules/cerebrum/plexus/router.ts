/**
 * tRPC router for cerebrum.plexus (PRD-090).
 *
 * Exposes adapter management and ingestion filter CRUD. The router is a thin
 * adapter over the lifecycle manager and database — no business logic here.
 *
 * Read/write split during the cerebrum.plexus cutover window:
 *  - Pure user-facing reads — `adapters.list`, `adapters.get`, `filters.list`
 *    — resolve through `getCerebrumDrizzle()` and forward to the
 *    `@pops/cerebrum-db` `plexusService.{listAdapters,getAdapter,listFilters}`
 *    namespace. This is the read seam of the cutover.
 *  - Writes (`filters.set` — atomic delete-then-insert) plus their
 *    accompanying parent-exists guard still go through the shared
 *    `pops.db` write handle (`getDb()`); the lifecycle-manager mutations
 *    (`register`, `unregister`, `healthCheck`, `sync`) also stay on
 *    `getDb()` via `lifecycle-db.ts` for read-after-write consistency.
 *    A follow-up cutover flips the writes too, at which point the
 *    router can collapse onto a single `CerebrumDb` handle and
 *    `getDb()` drops out. See PRD-180 for the broader pillar sequence;
 *    exact phase/PR numbering is owned by that doc and may drift from
 *    this comment.
 *
 * Cross-store consistency between the legacy `pops.db` writes and the
 * pillar's `cerebrum.db` reads relies on the boot-time backfill in
 * `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts` — same
 * pattern as the other cerebrum pillar cutovers (engrams,
 * conversations).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { plexusService } from '@pops/cerebrum-db';

import { getDb } from '../../../db.js';
import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';

import type { PlexusFilter, PlexusFilterRow } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToFilter(row: PlexusFilterRow): PlexusFilter {
  return {
    id: row.id,
    adapterId: row.adapter_id,
    filterType: row.filter_type,
    field: row.field,
    pattern: row.pattern,
    enabled: row.enabled === 1,
  };
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const adapterIdSchema = z.object({ adapterId: z.string().min(1) });

const filterDefinitionSchema = z.object({
  filterType: z.enum(['include', 'exclude']),
  field: z.string().min(1),
  pattern: z.string().min(1),
  enabled: z.boolean().optional().default(true),
});

const setFiltersSchema = z.object({
  adapterId: z.string().min(1),
  filters: z.array(filterDefinitionSchema),
});

// ---------------------------------------------------------------------------
// Sub-routers
// ---------------------------------------------------------------------------

const adaptersRouter = router({
  /**
   * List all registered adapters.
   *
   * Pure read — routed through the cerebrum pillar handle. See the
   * top-of-file JSDoc for the read/write split contract.
   */
  list: protectedProcedure.query(() => {
    return { adapters: plexusService.listAdapters(getCerebrumDrizzle()) };
  }),

  /**
   * Get a single adapter by ID.
   *
   * Pure read — routed through the cerebrum pillar handle.
   */
  get: protectedProcedure.input(adapterIdSchema).query(({ input }) => {
    const adapter = plexusService.getAdapter(getCerebrumDrizzle(), input.adapterId);
    if (!adapter) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Adapter '${input.adapterId}' not found` });
    }
    return { adapter };
  }),

  /** Run a health check on a specific adapter. */
  healthCheck: protectedProcedure.input(adapterIdSchema).mutation(async ({ input }) => {
    // Lazy-import to avoid circular dependency at module load time.
    const { getPlexusLifecycle } = await import('./instance.js');
    const lifecycle = getPlexusLifecycle();
    const result = await lifecycle.healthCheck(input.adapterId);
    return result;
  }),

  /** Trigger a manual sync for an adapter. */
  sync: protectedProcedure.input(adapterIdSchema).mutation(async ({ input }) => {
    const { getPlexusLifecycle } = await import('./instance.js');
    const lifecycle = getPlexusLifecycle();
    const result = await lifecycle.sync(input.adapterId);
    return result;
  }),

  /** Unregister (shutdown + remove) an adapter. */
  unregister: protectedProcedure.input(adapterIdSchema).mutation(async ({ input }) => {
    const { getPlexusLifecycle } = await import('./instance.js');
    const lifecycle = getPlexusLifecycle();
    const success = await lifecycle.unregister(input.adapterId);
    return { success };
  }),
});

const filtersRouter = router({
  /**
   * List filters for an adapter.
   *
   * Pure read — routed through the cerebrum pillar handle.
   */
  list: protectedProcedure.input(adapterIdSchema).query(({ input }) => {
    return { filters: plexusService.listFilters(getCerebrumDrizzle(), input.adapterId) };
  }),

  /**
   * Replace all filters for an adapter (atomic).
   *
   * Write path — stays on the shared `pops.db` handle (`getDb()`). The
   * parent-exists check shares the same handle so the guard sees the
   * latest write state. Returning the freshly-written filter list off
   * the same handle keeps the response consistent with the caller's
   * own write; routing the post-write read through the pillar handle
   * would surface a backfill-lag hole inside the same RPC. PRD-180
   * US-03 collapses both onto the pillar handle.
   */
  set: protectedProcedure.input(setFiltersSchema).mutation(({ input }) => {
    const db = getDb();

    // Verify adapter exists.
    const adapter = db
      .prepare('SELECT id FROM plexus_adapters WHERE id = ?')
      .get(input.adapterId) as { id: string } | undefined;
    if (!adapter) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Adapter '${input.adapterId}' not found`,
      });
    }

    // Validate regex patterns.
    for (const f of input.filters) {
      try {
        new RegExp(f.pattern);
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid regex pattern '${f.pattern}' for field '${f.field}'`,
        });
      }
    }

    // Full replace in a transaction.
    const txn = db.transaction(() => {
      db.prepare('DELETE FROM plexus_filters WHERE adapter_id = ?').run(input.adapterId);
      const insert = db.prepare(
        'INSERT INTO plexus_filters (id, adapter_id, filter_type, field, pattern, enabled) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const [i, f] of input.filters.entries()) {
        insert.run(
          `pxf_${input.adapterId}_${i}`,
          input.adapterId,
          f.filterType,
          f.field,
          f.pattern,
          f.enabled ? 1 : 0
        );
      }
    });
    txn();

    // Return the updated filter list.
    const rows = db
      .prepare('SELECT * FROM plexus_filters WHERE adapter_id = ? ORDER BY id')
      .all(input.adapterId) as PlexusFilterRow[];
    return { filters: rows.map(rowToFilter) };
  }),
});

// ---------------------------------------------------------------------------
// Composed plexus router
// ---------------------------------------------------------------------------

export const plexusRouter = router({
  adapters: adaptersRouter,
  filters: filtersRouter,
});
