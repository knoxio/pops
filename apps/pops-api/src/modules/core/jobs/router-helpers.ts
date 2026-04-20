import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getQueueByName } from '../../../jobs/queues.js';

import type { Job, Queue } from 'bullmq';

export const JOB_STATUSES = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JobSchema = z.object({
  id: z.string(),
  name: z.string(),
  queue: z.string(),
  data: z.unknown(),
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
  if (typeof p === 'object' && p !== null) return p as Record<string, unknown>;
  return p as string | boolean | number;
}

export function serializeJob(job: Job, queue: string): SerializedJob {
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

export async function getQueueOrThrow(queueName: string): Promise<Queue> {
  const q = getQueueByName(queueName);
  if (!q) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown queue: ${queueName}` });
  }
  return q;
}
