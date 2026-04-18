/**
 * Locations tRPC router — CRUD procedures for the location tree.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { toInventoryItem } from '../items/types.js';
import * as service from './service.js';
import { CreateLocationSchema, LocationSchema, toLocation, UpdateLocationSchema } from './types.js';

export const locationsRouter = router({
  /** Get the full location tree as nested nodes. */
  tree: protectedProcedure.query(() => {
    return { data: service.getLocationTree() };
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
      const { rows, total } = service.listLocations();
      return {
        data: rows.map(toLocation),
        total,
      };
    }),

  /** Get a single location by ID. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const row = service.getLocation(input.id);
      return { data: toLocation(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** Get breadcrumb path from root to specified location (root-first). */
  getPath: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const rows = service.getLocationPath(input.id);
      return { data: rows.map(toLocation) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

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
    .query(({ input }) => {
      try {
        const { rows, total } = service.getLocationItems(
          input.locationId,
          input.includeChildren,
          input.limit,
          input.offset
        );
        return {
          data: rows.map(toInventoryItem),
          total,
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** Get children of a location (one level deep). */
  children: protectedProcedure.input(z.object({ parentId: z.string() })).query(({ input }) => {
    const rows = service.getChildren(input.parentId);
    return { data: rows.map(toLocation) };
  }),

  /** Create a new location. */
  create: protectedProcedure.input(CreateLocationSchema).mutation(({ input }) => {
    try {
      const row = service.createLocation(input);
      return {
        data: toLocation(row),
        message: 'Location created',
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** Update an existing location (rename, move, reorder). */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateLocationSchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const row = service.updateLocation(input.id, input.data);
        return {
          data: toLocation(row),
          message: 'Location updated',
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        if (err instanceof ConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: err.message });
        }
        throw err;
      }
    }),

  /** Get stats about what will be affected by deleting a location. */
  deleteStats: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const stats = service.getDeleteStats(input.id);
      return { data: stats };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** Delete a location (cascade deletes children, items become unlocated). */
  delete: protectedProcedure
    .input(z.object({ id: z.string(), force: z.boolean().optional().default(false) }))
    .mutation(({ input }) => {
      try {
        // If not forced, check if location has contents and require confirmation
        if (!input.force) {
          const stats = service.getDeleteStats(input.id);
          if (stats.childCount > 0 || stats.itemCount > 0) {
            return { requiresConfirmation: true, stats };
          }
        }
        service.deleteLocation(input.id);
        return { message: 'Location deleted' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),
});
