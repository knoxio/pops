/**
 * tRPC router for cerebrum.reflexes (PRD-089 US-05).
 *
 * Exposes management endpoints: list, get, test, enable, disable, history.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { getReflexService } from './instance.js';

export const reflexRouter = router({
  list: protectedProcedure
    .input(z.object({ timezone: z.string().optional() }).optional())
    .query(({ input }) => {
      const service = getReflexService();
      const reflexes = service.listWithStatus(input?.timezone);
      return { reflexes };
    }),

  get: protectedProcedure.input(z.object({ name: z.string().min(1) })).query(({ input }) => {
    const service = getReflexService();
    const result = service.getWithHistory(input.name);
    if (!result) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Reflex "${input.name}" not found`,
      });
    }
    return result;
  }),

  test: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ input }) => {
    const service = getReflexService();
    const result = service.testReflex(input.name);
    if (!result) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Reflex "${input.name}" not found`,
      });
    }
    return { result };
  }),

  enable: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ input }) => {
    const service = getReflexService();
    const found = service.getByName(input.name);
    if (!found) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Reflex "${input.name}" not found`,
      });
    }
    const success = service.enableReflex(input.name);
    return { success };
  }),

  disable: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ input }) => {
    const service = getReflexService();
    const found = service.getByName(input.name);
    if (!found) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Reflex "${input.name}" not found`,
      });
    }
    const success = service.disableReflex(input.name);
    return { success };
  }),

  history: protectedProcedure
    .input(
      z
        .object({
          name: z.string().optional(),
          triggerType: z.enum(['event', 'threshold', 'schedule']).optional(),
          status: z.enum(['triggered', 'executing', 'completed', 'failed']).optional(),
          limit: z.number().int().positive().max(200).optional(),
          offset: z.number().int().nonnegative().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      const service = getReflexService();
      return service.getHistory(input ?? {});
    }),
});
