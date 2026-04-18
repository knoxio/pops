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

function serializeJob(job: Job, queue: string): Record<string, unknown> {
  return {
    id: job.id ?? '',
    name: job.name,
    queue,
    data: job.data as unknown,
    progress: job.progress,
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
    .input(
      z.object({
        queue: z.string().optional(),
        status: z.enum(JOB_STATUSES).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const { queue: queueFilter, status, limit, offset } = input;

      const queueNames = queueFilter
        ? [queueFilter, ...(queueFilter !== DEAD_LETTER_QUEUE ? [] : [])]
        : [...ALL_QUEUES, DEAD_LETTER_QUEUE];

      const statuses: JobStatus[] = status ? [status] : [...JOB_STATUSES];

      const allJobs: ReturnType<typeof serializeJob>[] = [];

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
    .input(z.object({ jobId: z.string().min(1), queue: z.string().min(1) }))
    .query(async ({ input }) => {
      const q = await getQueueOrThrow(input.queue);
      const job = await q.getJob(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      return { job: serializeJob(job, input.queue) };
    }),

  /** Re-enqueue a failed job with reset attempt count. */
  retry: protectedProcedure
    .input(z.object({ jobId: z.string().min(1), queue: z.string().min(1) }))
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
    .input(z.object({ jobId: z.string().min(1), queue: z.string().min(1) }))
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
    .input(z.object({ queue: z.string().min(1), confirm: z.literal(true) }))
    .mutation(async ({ input }) => {
      const q = await getQueueOrThrow(input.queue);
      const counts = await q.getJobCounts('waiting');
      const drained = counts.waiting ?? 0;
      await q.drain();
      return { drained };
    }),

  /** Return job counts by status for every queue including the dead-letter queue. */
  queueStats: protectedProcedure.query(async () => {
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
  schedulers: protectedProcedure.query(async () => {
    try {
      const schedulers = await getSyncQueue().getJobSchedulers();
      return { schedulers };
    } catch {
      return { schedulers: [] };
    }
  }),
});
