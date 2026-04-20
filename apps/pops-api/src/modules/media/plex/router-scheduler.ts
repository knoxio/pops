import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import * as scheduler from './scheduler.js';
import * as plexService from './service.js';

export const schedulerProcedures = {
  getSyncStatus: protectedProcedure.query(() => {
    const client = plexService.getPlexClient();
    return { data: plexService.getSyncStatus(client) };
  }),

  startScheduler: protectedProcedure
    .input(
      z
        .object({
          intervalMs: z.number().int().positive().optional(),
          movieSectionId: z.string().min(1).optional(),
          tvSectionId: z.string().min(1).optional(),
        })
        .optional()
    )
    .mutation(({ input }) => {
      return { data: scheduler.startScheduler(input ?? {}) };
    }),

  stopScheduler: protectedProcedure.mutation(() => {
    return { data: scheduler.stopScheduler() };
  }),

  getSchedulerStatus: protectedProcedure.query(() => {
    return { data: scheduler.getSchedulerStatus() };
  }),

  getSyncLogs: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).optional() }).optional())
    .query(({ input }) => {
      return { data: scheduler.getSyncLogs(input?.limit ?? 20) };
    }),

  getSectionIds: protectedProcedure.query(() => {
    return { data: plexService.getPlexSectionIds() };
  }),

  saveSectionIds: protectedProcedure
    .input(
      z.object({
        movieSectionId: z.string().min(1).optional(),
        tvSectionId: z.string().min(1).optional(),
      })
    )
    .mutation(({ input }) => {
      plexService.savePlexSectionIds(input.movieSectionId, input.tvSectionId);
      return { message: 'Section IDs saved' };
    }),
};
