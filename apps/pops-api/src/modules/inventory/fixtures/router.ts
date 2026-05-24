import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import * as service from './service.js';
import {
  ConnectFixtureSchema,
  CreateFixtureSchema,
  FixtureConnectionQuerySchema,
  FixtureQuerySchema,
  FixtureSchema,
  ItemFixtureConnectionSchema,
  toFixture,
  toItemFixtureConnection,
  UpdateFixtureSchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const fixturesRouter = router({
  list: protectedProcedure
    .input(FixtureQuerySchema)
    .output(z.object({ data: z.array(FixtureSchema), total: z.number() }))
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;
      const { rows, total } = service.listFixtures({
        locationId: input.locationId,
        type: input.type,
        limit,
        offset,
      });
      return { data: rows.map(toFixture), total };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .output(z.object({ data: FixtureSchema }))
    .query(({ input }) => {
      try {
        return { data: toFixture(service.getFixture(input.id)) };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  create: protectedProcedure.input(CreateFixtureSchema).mutation(({ input }) => {
    const row = service.createFixture(input);
    return { data: toFixture(row), message: 'Fixture created' };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().min(1), data: UpdateFixtureSchema }))
    .mutation(({ input }) => {
      try {
        const row = service.updateFixture(input.id, input.data);
        return { data: toFixture(row), message: 'Fixture updated' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  delete: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    try {
      service.deleteFixture(input.id);
      return { message: 'Fixture deleted' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  connect: protectedProcedure.input(ConnectFixtureSchema).mutation(({ input }) => {
    try {
      const row = service.connectItemToFixture(input.itemId, input.fixtureId);
      return { data: toItemFixtureConnection(row), message: 'Item connected to fixture' };
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

  disconnect: protectedProcedure.input(ConnectFixtureSchema).mutation(({ input }) => {
    try {
      service.disconnectItemFromFixture(input.itemId, input.fixtureId);
      return { message: 'Item disconnected from fixture' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  listForItem: protectedProcedure
    .input(FixtureConnectionQuerySchema)
    .output(
      z.object({ data: z.array(ItemFixtureConnectionSchema), pagination: PaginationMetaSchema })
    )
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;
      const { rows, total } = service.listFixturesForItem(input.itemId, limit, offset);
      return {
        data: rows.map(toItemFixtureConnection),
        pagination: paginationMeta(total, limit, offset),
      };
    }),
});
