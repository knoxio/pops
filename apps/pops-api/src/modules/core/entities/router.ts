/**
 * Entity tRPC router — CRUD procedures for entities.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import * as service from './service.js';
import {
  CreateEntitySchema,
  EntityQuerySchema,
  EntitySchema,
  toEntity,
  UpdateEntitySchema,
} from './types.js';

/** Default pagination values. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const entitiesRouter = router({
  /** List entities with optional search/type filters and pagination. */
  list: protectedProcedure
    .meta({
      openapi: { method: 'GET', path: '/entities', summary: 'List entities', tags: ['entities'] },
    })
    .input(EntityQuerySchema)
    .output(z.object({ data: z.array(EntitySchema), pagination: PaginationMetaSchema }))
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const { rows, total } = service.listEntities(
        input.search,
        input.type,
        limit,
        offset,
        input.orphanedOnly
      );

      return {
        data: rows.map(toEntity),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Get a single entity by ID. */
  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/entities/{id}',
        summary: 'Get entity by ID',
        tags: ['entities'],
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ data: EntitySchema }))
    .query(({ input }) => {
      try {
        const row = service.getEntity(input.id);
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
    .meta({
      openapi: { method: 'POST', path: '/entities', summary: 'Create entity', tags: ['entities'] },
    })
    .input(CreateEntitySchema)
    .output(z.object({ data: EntitySchema, message: z.string() }))
    .mutation(({ input }) => {
      try {
        const row = service.createEntity(input);
        return {
          data: toEntity(row),
          message: 'Entity created',
        };
      } catch (err) {
        if (err instanceof ConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: err.message });
        }
        throw err;
      }
    }),

  /** Update an existing entity. */
  update: protectedProcedure
    .meta({
      openapi: {
        method: 'PATCH',
        path: '/entities/{id}',
        summary: 'Update entity',
        tags: ['entities'],
      },
    })
    .input(
      z.object({
        id: z.string(),
        data: UpdateEntitySchema,
      })
    )
    .output(z.object({ data: EntitySchema, message: z.string() }))
    .mutation(({ input }) => {
      try {
        const row = service.updateEntity(input.id, input.data);
        return {
          data: toEntity(row),
          message: 'Entity updated',
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

  /** Delete an entity. */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    try {
      service.deleteEntity(input.id);
      return { message: 'Entity deleted' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),
});
