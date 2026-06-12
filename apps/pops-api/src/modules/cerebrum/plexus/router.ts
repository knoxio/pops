/**
 * tRPC router for cerebrum.plexus (PRD-090).
 *
 * Exposes adapter management and ingestion filter CRUD. The router is a thin
 * adapter over the lifecycle manager and database — no business logic here.
 *
 * Post-cutover (PRD-180 US-03 / PR3): every read and write resolves through
 * `getCerebrumDrizzle()` and delegates to the `@pops/cerebrum-db`
 * `plexusService` namespace. The previous read/write split — where reads
 * landed on `cerebrum.db` but `filters.set` + the lifecycle-manager
 * mutations still wrote to the shared `pops.db` — is closed. The
 * lifecycle-manager writes flow through the same pillar handle via
 * `lifecycle-db.ts`. The TOML loader, the per-adapter HTTP clients
 * (Notion / Linear / IMAP / etc.), and the envelope encryption of the
 * `config` blob stay in this module — they are domain orchestration / IO,
 * not data-access.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { plexusService, PlexusAdapterNotFoundError } from '@pops/cerebrum-db';

import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';

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
  /** List all registered adapters. */
  list: protectedProcedure.query(() => {
    return { adapters: plexusService.listAdapters(getCerebrumDrizzle()) };
  }),

  /** Get a single adapter by ID. */
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
  /** List filters for an adapter. */
  list: protectedProcedure.input(adapterIdSchema).query(({ input }) => {
    return { filters: plexusService.listFilters(getCerebrumDrizzle(), input.adapterId) };
  }),

  /**
   * Replace all filters for an adapter (atomic).
   *
   * Routed through the cerebrum pillar handle. `plexusService.setFilters`
   * runs the delete-then-insert inside a single transaction and throws
   * `PlexusAdapterNotFoundError` when the parent adapter is missing so
   * filter rules never get orphaned under a phantom id. The return
   * payload is the freshly-written list off the same handle, keeping the
   * RPC response consistent with the write the caller just made.
   */
  set: protectedProcedure.input(setFiltersSchema).mutation(({ input }) => {
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

    try {
      const filters = plexusService.setFilters(
        getCerebrumDrizzle(),
        input.adapterId,
        input.filters
      );
      return { filters };
    } catch (err) {
      if (err instanceof PlexusAdapterNotFoundError) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Adapter '${input.adapterId}' not found`,
        });
      }
      throw err;
    }
  }),
});

// ---------------------------------------------------------------------------
// Composed plexus router
// ---------------------------------------------------------------------------

export const plexusRouter = router({
  adapters: adaptersRouter,
  filters: filtersRouter,
});
