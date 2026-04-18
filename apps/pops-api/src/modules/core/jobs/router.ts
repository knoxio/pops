import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  ALL_QUEUES,
  DEAD_LETTER_QUEUE,
  getSyncQueue,
  getDeadLetterQueue,
  getQueueByName,
} from '../../../jobs/queues.js';
import { protectedProcedure, router } from '../../../trpc.js';

import type { Job, Queue } from 'bullmq';

// ---------------------------------------------------------------------------
// Shared types / helpers
// ---------------------------------------------------------------------------

const JOB_STATUSES = ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'] as const;
type JobStatus = (typeof JOB_STATUSES)[number];

/** Zod schema for a serialized job object returned by the API. */
export const JobSchema = z.object({
  id: z.string(),
  name: z.string(),
  queue: z.string(),
  data: z.unknown(),
  /** BullMQ JobProgress: string | boolean | number | object */
  progress: z.union([z.string(), z.boolean(), z.number(), z.record(z.string(), z.unknown())]),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  failedReason: z.string().nullable(),
  processedOn: z.string().nullable(),
  finishedOn: z.string().nullable(),
  timestamp: z.string().nullable(),
  returnValue: z.unknown(),
  stacktrace: z.array(z.string()),
});

export type SerializedJob = z.infer<typeof JobSchema>;

function serializeProgress(
  p: string | boolean | number | object
): string | boolean | number | Record<string, unknown> {
  if (typeof p === 'object' && p !== null) {
    return p as Record<string, unknown>;
  }
  return p as string | boolean | number;
}

function serializeJob(job: Job, queue: string): SerializedJob {
  return {
    id: job.id ?? '',
    name: job.name,
    queue,
    data: job.data as unknown,
    progress: serializeProgress(job.progress),
    attempts: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1,
    failedReason: job.failedReason ?? null,
    processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    returnValue: job.returnvalue as unknown,
    stacktrace: job.stacktrace ?? [],
  };
}

async function getQueueOrThrow(queueName: string): Promise<Queue> {
  const q = getQueueByName(queueName);
  if (!q) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Unknown queue: ${queueName}`,
    });
  }
  return q;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const jobsRouter = router({
  /** List jobs across queues with optional filtering. */
  list: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/jobs',
        summary: 'List jobs',
        description: 'List jobs across all queues with optional queue and status filtering.',
        tags: ['jobs'],
      },
    })
    .input(
      z.object({
        queue: z.string().optional(),
        status: z.enum(JOB_STATUSES).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .output(z.object({ jobs: z.array(JobSchema), total: z.number().int() }))
    .query(async ({ input }) => {
      const { queue: queueFilter, status, limit, offset } = input;

      const queueNames = queueFilter
        ? [queueFilter, ...(queueFilter !== DEAD_LETTER_QUEUE ? [] : [])]
        : [...ALL_QUEUES, DEAD_LETTER_QUEUE];

      const statuses: JobStatus[] = status ? [status] : [...JOB_STATUSES];

      const allJobs: SerializedJob[] = [];

      for (const queueName of queueNames) {
        const q = getQueueByName(queueName);
        if (!q) continue;
        try {
          const jobs = await q.getJobs(statuses);
          for (const job of jobs) {
            allJobs.push(serializeJob(job, queueName));
          }
        } catch {
          // Queue unavailable (Redis down) — skip
        }
      }

      const total = allJobs.length;
      const page = allJobs.slice(offset, offset + limit);

      return { jobs: page, total };
    }),

  /** Get full details for a specific job. */
  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/jobs/{queue}/{jobId}',
        summary: 'Get job by ID',
        description: 'Retrieve full details for a specific job in a given queue.',
        tags: ['jobs'],
      },
    })
    .input(z.object({ jobId: z.string().min(1), queue: z.string().min(1) }))
    .output(z.object({ job: JobSchema }))
    .query(async ({ input }) => {
      const q = await getQueueOrThrow(input.queue);
      const job = await q.getJob(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      return { job: serializeJob(job, input.queue) };
    }),

  /** Re-enqueue a failed job with reset attempt count. */
  retry: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/jobs/{queue}/{jobId}/retry',
        summary: 'Retry job',
        description:
          'Re-enqueue a failed job. Dead-letter jobs are re-enqueued to their original queue.',
        tags: ['jobs'],
      },
    })
    .input(z.object({ jobId: z.string().min(1), queue: z.string().min(1) }))
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ input }) => {
      // Dead-letter jobs are re-enqueued to their original queue
      if (input.queue === DEAD_LETTER_QUEUE) {
        const dlq = getDeadLetterQueue();
        const job = await dlq.getJob(input.jobId);
        if (!job)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Dead-letter job not found',
          });

        const dlData = job.data as {
          originalQueue?: string;
          originalData?: unknown;
          originalJobName?: string;
        };
        const originalQueue = dlData.originalQueue;
        if (!originalQueue) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Missing originalQueue in dead-letter job data',
          });
        }

        const origQ = await getQueueOrThrow(originalQueue);
        const jobName = dlData.originalJobName ?? 'retried';
        await origQ.add(jobName, dlData.originalData as Record<string, unknown>);
        await job.remove();
        return { success: true };
      }

      const q = await getQueueOrThrow(input.queue);
      const job = await q.getJob(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });

      await job.retry();
      return { success: true };
    }),

  /** Cancel a waiting or active job. */
  cancel: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/jobs/{queue}/{jobId}/cancel',
        summary: 'Cancel job',
        description: 'Cancel a waiting or active job by removing or discarding it from the queue.',
        tags: ['jobs'],
      },
    })
    .input(z.object({ jobId: z.string().min(1), queue: z.string().min(1) }))
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ input }) => {
      const q = await getQueueOrThrow(input.queue);
      const job = await q.getJob(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });

      const state = await job.getState();
      if (state === 'active') {
        await job.discard();
      } else {
        await job.remove();
      }
      return { success: true };
    }),

  /** Remove all waiting jobs from a specific queue. */
  drain: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/jobs/{queue}/drain',
        summary: 'Drain queue',
        description: 'Remove all waiting jobs from the specified queue. Requires confirm=true.',
        tags: ['jobs'],
      },
    })
    .input(z.object({ queue: z.string().min(1), confirm: z.literal(true) }))
    .output(z.object({ drained: z.number().int() }))
    .mutation(async ({ input }) => {
      const q = await getQueueOrThrow(input.queue);
      const counts = await q.getJobCounts('waiting');
      const drained = counts.waiting ?? 0;
      await q.drain();
      return { drained };
    }),

  /** Return job counts by status for every queue including the dead-letter queue. */
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
          z.object({
            queue: z.string(),
            counts: z.record(z.string(), z.number().int()),
          })
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

  /** List all active repeatable job schedulers for the sync queue. */
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
        const schedulers = await getSyncQueue().getJobSchedulers();
        return { schedulers };
      } catch {
        return { schedulers: [] };
      }
    }),
});
