/**
 * Locations tRPC router — the first writer slice cut over from pops-api
 * into pops-inventory-api as part of Phase 5 PR 1 (Track M4).
 *
 * Procedure surface mirrors `apps/pops-api/src/modules/inventory/locations/router.ts`
 * with one deliberate exclusion: `getItems` is not migrated in this PR
 * because the inventory items projection (`toInventoryItem`) still lives
 * in `apps/pops-api/src/modules/inventory/items/types.ts` and inventory-api
 * is supposed to stand alone in the dep graph. The legacy pops-api
 * router keeps serving `inventory.locations.getItems` (and every other
 * `inventory.*` route) as fall-through until Phase 5 PR 2 flips the
 * dispatcher; this PR is purely additive.
 *
 * Domain errors from `@pops/inventory-db` are translated to local
 * `HttpError` subclasses and then routed through `mapDomainErrors` so
 * the tRPC layer sees a proper `TRPCError` with the right wire-level
 * code (`NOT_FOUND` / `CONFLICT`).
 */
import { z } from 'zod';

import {
  LocationCycleError,
  LocationNotFoundError,
  LocationSelfParentError,
  ParentLocationNotFoundError,
  locationsService,
} from '@pops/inventory-db';

import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';
import { CreateLocationSchema, LocationSchema, toLocation, UpdateLocationSchema } from './types.js';

function translateLocationError(err: unknown): never {
  if (err instanceof LocationNotFoundError) {
    throw new NotFoundError('Location', err.id);
  }
  if (err instanceof ParentLocationNotFoundError) {
    throw new NotFoundError('Parent location', err.id);
  }
  if (err instanceof LocationCycleError) {
    throw new ConflictError('Moving this location would create a circular reference');
  }
  if (err instanceof LocationSelfParentError) {
    throw new ConflictError('A location cannot be its own parent');
  }
  throw err;
}

export const locationsRouter = router({
  tree: protectedProcedure.query(({ ctx }) => {
    return { data: locationsService.getLocationTree(ctx.inventoryDb) };
  }),

  list: protectedProcedure
    .output(z.object({ data: z.array(LocationSchema), total: z.number() }))
    .query(({ ctx }) => {
      const { rows, total } = locationsService.listLocations(ctx.inventoryDb);
      return {
        data: rows.map(toLocation),
        total,
      };
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        const row = locationsService.getLocation(ctx.inventoryDb, input.id);
        return { data: toLocation(row) };
      } catch (err) {
        translateLocationError(err);
      }
    })
  ),

  getPath: protectedProcedure.input(z.object({ id: z.string() })).query(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        const rows = locationsService.getLocationPath(ctx.inventoryDb, input.id);
        return { data: rows.map(toLocation) };
      } catch (err) {
        translateLocationError(err);
      }
    })
  ),

  children: protectedProcedure.input(z.object({ parentId: z.string() })).query(({ input, ctx }) => {
    const rows = locationsService.getChildren(ctx.inventoryDb, input.parentId);
    return { data: rows.map(toLocation) };
  }),

  create: protectedProcedure.input(CreateLocationSchema).mutation(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        const row = locationsService.createLocation(ctx.inventoryDb, input);
        return {
          data: toLocation(row),
          message: 'Location created',
        };
      } catch (err) {
        translateLocationError(err);
      }
    })
  ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateLocationSchema,
      })
    )
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          const row = locationsService.updateLocation(ctx.inventoryDb, input.id, input.data);
          return {
            data: toLocation(row),
            message: 'Location updated',
          };
        } catch (err) {
          translateLocationError(err);
        }
      })
    ),

  deleteStats: protectedProcedure.input(z.object({ id: z.string() })).query(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        const stats = locationsService.getDeleteStats(ctx.inventoryDb, input.id);
        return { data: stats };
      } catch (err) {
        translateLocationError(err);
      }
    })
  ),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), force: z.boolean().optional().default(false) }))
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          if (!input.force) {
            const stats = locationsService.getDeleteStats(ctx.inventoryDb, input.id);
            if (stats.childCount > 0 || stats.itemCount > 0) {
              return { requiresConfirmation: true, stats };
            }
          }
          locationsService.deleteLocation(ctx.inventoryDb, input.id);
          return { message: 'Location deleted' };
        } catch (err) {
          translateLocationError(err);
        }
      })
    ),
});
