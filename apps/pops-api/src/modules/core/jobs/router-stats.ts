import { z } from 'zod';

import {
  ALL_QUEUES,
  DEAD_LETTER_QUEUE,
  getQueueByName,
  getSyncQueue,
} from '../../../jobs/queues.js';
import { protectedProcedure, router } from '../../../trpc.js';

export const statsRouter = router({
  queueStats: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/jobs/stats',
        summary: 'Queue statistics',
        description:
          'Return job counts by status for every queue, including the dead-letter queue.',
        tags: ['jobs'],
      },
    })
    .output(
      z.object({
        queues: z.array(
          z.object({ queue: z.string(), counts: z.record(z.string(), z.number().int()) })
        ),
      })
    )
    .query(async () => {
      const queueNames = [...ALL_QUEUES, DEAD_LETTER_QUEUE] as string[];
      const results = await Promise.all(
        queueNames.map(async (name) => {
          const q = getQueueByName(name);
          if (!q) return { queue: name, counts: {} };
          try {
            const counts = await q.getJobCounts(
              'waiting',
              'active',
              'completed',
              'failed',
              'delayed',
              'paused'
            );
            return { queue: name, counts };
          } catch {
            return { queue: name, counts: {} };
          }
        })
      );
      return { queues: results };
    }),

  schedulers: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/jobs/schedulers',
        summary: 'List job schedulers',
        description: 'List all active repeatable job schedulers for the sync queue.',
        tags: ['jobs'],
      },
    })
    .output(
      z.object({
        schedulers: z.array(
          z.object({
            key: z.string(),
            name: z.string(),
            id: z.string().nullable().optional(),
            iterationCount: z.number().int().optional(),
            limit: z.number().int().optional(),
            startDate: z.number().optional(),
            endDate: z.number().optional(),
            tz: z.string().optional(),
            pattern: z.string().optional(),
            every: z.number().optional(),
            next: z.number().optional(),
            offset: z.number().optional(),
            template: z
              .object({
                data: z.unknown().optional(),
                opts: z.record(z.string(), z.unknown()).optional(),
              })
              .optional(),
          })
        ),
      })
    )
    .query(async () => {
      try {
        const q = getSyncQueue();
        if (!q) return { schedulers: [] };
        const schedulers = await q.getJobSchedulers();
        return { schedulers };
      } catch {
        return { schedulers: [] };
      }
    }),
});
