import { z } from 'zod';

/**
 * Locations tRPC router — CRUD procedures for the location tree.
 *
 * Domain errors from `@pops/inventory-db` are translated to `HttpError`
 * subclasses inside the handler and then routed through `mapDomainErrors`
 * so the tRPC layer sees a proper `TRPCError` with the right wire-level
 * code (`NOT_FOUND` / `CONFLICT`). Throwing `HttpError` directly out of
 * a tRPC handler surfaces as `INTERNAL_SERVER_ERROR` at the OpenAPI
 * boundary, so the wrapper is load-bearing.
 */
import {
  LocationCycleError,
  LocationNotFoundError,
  LocationSelfParentError,
  ParentLocationNotFoundError,
  locationsService,
} from '@pops/inventory-db';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { mapDomainErrors } from '../../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { toInventoryItem } from '../items/types.js';
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
  /** Get the full location tree as nested nodes. */
  tree: protectedProcedure.query(() => {
    return { data: locationsService.getLocationTree(getDrizzle()) };
  }),

  /** List all locations (flat). */
  list: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/inventory/locations',
        summary: 'List locations',
        tags: ['locations'],
      },
    })
    .output(z.object({ data: z.array(LocationSchema), total: z.number() }))
    .query(() => {
      const { rows, total } = locationsService.listLocations(getDrizzle());
      return {
        data: rows.map(toLocation),
        total,
      };
    }),

  /** Get a single location by ID. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
    mapDomainErrors(() => {
      try {
        const row = locationsService.getLocation(getDrizzle(), input.id);
        return { data: toLocation(row) };
      } catch (err) {
        translateLocationError(err);
      }
    })
  ),

  /** Get breadcrumb path from root to specified location (root-first). */
  getPath: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
    mapDomainErrors(() => {
      try {
        const rows = locationsService.getLocationPath(getDrizzle(), input.id);
        return { data: rows.map(toLocation) };
      } catch (err) {
        translateLocationError(err);
      }
    })
  ),

  /** Get items at a location, optionally including descendant locations. */
  getItems: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        includeChildren: z.boolean().optional().default(false),
        limit: z.coerce.number().positive().optional().default(50),
        offset: z.coerce.number().nonnegative().optional().default(0),
      })
    )
    .query(({ input }) =>
      mapDomainErrors(() => {
        try {
          const { rows, total } = locationsService.getLocationItems(getDrizzle(), input);
          return {
            data: rows.map(toInventoryItem),
            total,
          };
        } catch (err) {
          translateLocationError(err);
        }
      })
    ),

  /** Get children of a location (one level deep). */
  children: protectedProcedure.input(z.object({ parentId: z.string() })).query(({ input }) => {
    const rows = locationsService.getChildren(getDrizzle(), input.parentId);
    return { data: rows.map(toLocation) };
  }),

  /** Create a new location. */
  create: protectedProcedure.input(CreateLocationSchema).mutation(({ input }) =>
    mapDomainErrors(() => {
      try {
        const row = locationsService.createLocation(getDrizzle(), input);
        return {
          data: toLocation(row),
          message: 'Location created',
        };
      } catch (err) {
        translateLocationError(err);
      }
    })
  ),

  /** Update an existing location (rename, move, reorder). */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateLocationSchema,
      })
    )
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        try {
          const row = locationsService.updateLocation(getDrizzle(), input.id, input.data);
          return {
            data: toLocation(row),
            message: 'Location updated',
          };
        } catch (err) {
          translateLocationError(err);
        }
      })
    ),

  /** Get stats about what will be affected by deleting a location. */
  deleteStats: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
    mapDomainErrors(() => {
      try {
        const stats = locationsService.getDeleteStats(getDrizzle(), input.id);
        return { data: stats };
      } catch (err) {
        translateLocationError(err);
      }
    })
  ),

  /** Delete a location (cascade deletes children, items become unlocated). */
  delete: protectedProcedure
    .input(z.object({ id: z.string(), force: z.boolean().optional().default(false) }))
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        try {
          // If not forced, check if location has contents and require confirmation
          if (!input.force) {
            const stats = locationsService.getDeleteStats(getDrizzle(), input.id);
            if (stats.childCount > 0 || stats.itemCount > 0) {
              return { requiresConfirmation: true, stats };
            }
          }
          locationsService.deleteLocation(getDrizzle(), input.id);
          return { message: 'Location deleted' };
        } catch (err) {
          translateLocationError(err);
        }
      })
    ),
});
