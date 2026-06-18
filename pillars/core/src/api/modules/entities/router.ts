/**
 * `core.entities.*` tRPC router — plain CRUD over the `entities` table.
 *
 * Relocated from `apps/pops-api/src/modules/core/entities/router.ts`. The
 * `transactionCount` column and `orphanedOnly` filter (both derived from a
 * finance LEFT JOIN) are dropped — see `./service.ts` for the rationale.
 * `list` therefore returns the bare entity rows with no per-entity count.
 *
 * OpenAPI `.meta()` blocks are intentionally omitted: the pillar's tRPC
 * surface is tRPC-only (the dispatcher/gateway owns OpenAPI), matching the
 * other migrated routers.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../shared/pagination.js';
import { protectedProcedure, router } from '../../trpc.js';
import * as service from './service.js';
import {
  CreateEntitySchema,
  EntityQuerySchema,
  EntitySchema,
  toEntity,
  UpdateEntitySchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const entitiesRouter = router({
  /** List entities with optional search/type filters and pagination. */
  list: protectedProcedure
    .input(EntityQuerySchema)
    .output(z.object({ data: z.array(EntitySchema), pagination: PaginationMetaSchema }))
    .query(({ input, ctx }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const { rows, total } = service.listEntities(ctx.coreDb, {
        search: input.search,
        type: input.type,
        limit,
        offset,
      });

      return {
        data: rows.map(toEntity),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Get a single entity by ID. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ data: EntitySchema }))
    .query(({ input, ctx }) => {
      try {
        const row = service.getEntity(ctx.coreDb, input.id);
        return { data: toEntity(row) };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** Create a new entity. */
  create: protectedProcedure
    .input(CreateEntitySchema)
    .output(z.object({ data: EntitySchema, message: z.string() }))
    .mutation(({ input, ctx }) => {
      try {
        const row = service.createEntity(ctx.coreDb, input);
        return { data: toEntity(row), message: 'Entity created' };
      } catch (err) {
        if (err instanceof ConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: err.message });
        }
        throw err;
      }
    }),

  /** Update an existing entity. */
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: UpdateEntitySchema }))
    .output(z.object({ data: EntitySchema, message: z.string() }))
    .mutation(({ input, ctx }) => {
      try {
        const row = service.updateEntity(ctx.coreDb, input.id, input.data);
        return { data: toEntity(row), message: 'Entity updated' };
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

  /** Delete an entity. */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ message: z.string() }))
    .mutation(({ input, ctx }) => {
      try {
        service.deleteEntity(ctx.coreDb, input.id);
        return { message: 'Entity deleted' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),
});
