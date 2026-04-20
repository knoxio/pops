import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  ALL_QUEUES,
  DEAD_LETTER_QUEUE,
  getDeadLetterQueue,
  getQueueByName,
} from '../../../jobs/queues.js';
import { mergeRouters, protectedProcedure, router } from '../../../trpc.js';
import {
  getQueueOrThrow,
  JobSchema,
  JOB_STATUSES,
  serializeJob,
  type JobStatus,
  type SerializedJob,
} from './router-helpers.js';
import { statsRouter } from './router-stats.js';

export { JobSchema, type SerializedJob } from './router-helpers.js';

async function listJobsAcrossQueues(
  queueNames: string[],
  statuses: JobStatus[]
): Promise<SerializedJob[]> {
  const allJobs: SerializedJob[] = [];
  for (const queueName of queueNames) {
    const q = getQueueByName(queueName);
    if (!q) continue;
    try {
      const jobs = await q.getJobs(statuses);
      for (const job of jobs) allJobs.push(serializeJob(job, queueName));
    } catch {
      // Queue unavailable (Redis down) — skip
    }
  }
  return allJobs;
}

async function retryDeadLetterJob(jobId: string): Promise<void> {
  const dlq = getDeadLetterQueue();
  const job = await dlq.getJob(jobId);
  if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dead-letter job not found' });

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
  await origQ.add(
    dlData.originalJobName ?? 'retried',
    dlData.originalData as Record<string, unknown>
  );
  await job.remove();
}

const operationsRouter = router({
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
      const queueNames = input.queue ? [input.queue] : [...ALL_QUEUES, DEAD_LETTER_QUEUE];
      const statuses: JobStatus[] = input.status ? [input.status] : [...JOB_STATUSES];
      const allJobs = await listJobsAcrossQueues(queueNames, statuses);
      return {
        jobs: allJobs.slice(input.offset, input.offset + input.limit),
        total: allJobs.length,
      };
    }),

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
      if (input.queue === DEAD_LETTER_QUEUE) {
        await retryDeadLetterJob(input.jobId);
        return { success: true };
      }
      const q = await getQueueOrThrow(input.queue);
      const job = await q.getJob(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      await job.retry();
      return { success: true };
    }),

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
      if (state === 'active') await job.discard();
      else await job.remove();
      return { success: true };
    }),

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
});

export const jobsRouter = mergeRouters(operationsRouter, statsRouter);
