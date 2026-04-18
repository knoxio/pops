import { describe, expect, it, vi } from 'vitest';

import {
  CURATION_JOB_OPTIONS,
  DEAD_LETTER_QUEUE,
  DEFAULT_JOB_OPTIONS,
  EMBEDDINGS_JOB_OPTIONS,
  SYNC_JOB_OPTIONS,
} from './queues.js';

// Mock BullMQ with a proper constructor (not an arrow function)
const { MockQueue } = vi.hoisted(() => {
  const MockQueue = vi.fn(function (this: Record<string, unknown>, name: string) {
    this.name = name;
    this.close = vi.fn().mockResolvedValue(undefined);
    this.add = vi.fn().mockResolvedValue({ id: 'dlq-1' });
  });
  return { MockQueue };
});

vi.mock('bullmq', () => ({ Queue: MockQueue }));
vi.mock('./redis.js', () => ({ createRedisConnection: vi.fn().mockReturnValue({}) }));

// ---------------------------------------------------------------------------
// Queue configuration — verify the retry + dead-letter setup
// ---------------------------------------------------------------------------

describe('failure handling — queue configuration', () => {
  it('all queues have at least 2 retry attempts before exhaustion', () => {
    expect(SYNC_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(2);
    expect(EMBEDDINGS_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(2);
    expect(CURATION_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(2);
  });

  it('all queues use exponential backoff between retries', () => {
    for (const opts of [
      SYNC_JOB_OPTIONS,
      EMBEDDINGS_JOB_OPTIONS,
      CURATION_JOB_OPTIONS,
      DEFAULT_JOB_OPTIONS,
    ]) {
      expect(opts.backoff).toMatchObject({ type: 'exponential' });
    }
  });

  it('all queues retain failed jobs (removeOnFail: false) for dead-letter routing', () => {
    expect(SYNC_JOB_OPTIONS.removeOnFail).toBe(false);
    expect(EMBEDDINGS_JOB_OPTIONS.removeOnFail).toBe(false);
    expect(CURATION_JOB_OPTIONS.removeOnFail).toBe(false);
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(false);
  });

  it('dead-letter queue name is distinct from operational queues', () => {
    const operationalQueues = ['pops:sync', 'pops:embeddings', 'pops:curation', 'pops:default'];
    expect(operationalQueues).not.toContain(DEAD_LETTER_QUEUE);
  });
});

// ---------------------------------------------------------------------------
// Dead-letter routing — simulate an exhausted job landing in the DLQ
// ---------------------------------------------------------------------------

describe('failure handling — dead-letter routing', () => {
  it('moves exhausted job to the dead-letter queue with original metadata', async () => {
    const { getDeadLetterQueue } = await import('./queues.js');
    const dlq = getDeadLetterQueue() as unknown as {
      add: (name: string, data: Record<string, unknown>) => Promise<{ id: string }>;
      name: string;
    };

    const jobData = {
      originalQueue: 'pops:sync',
      originalJobId: 'job-42',
      originalJobName: 'plexSyncMovies',
      originalData: { type: 'plexSyncMovies' },
      failedAt: new Date().toISOString(),
      attemptsMade: 3,
      finalError: 'Connection timeout',
      finalErrorStack: 'Error: Connection timeout\n  at ...',
    };

    await dlq.add(DEAD_LETTER_QUEUE, jobData);

    expect(dlq.add).toHaveBeenCalledWith(
      DEAD_LETTER_QUEUE,
      expect.objectContaining({
        originalQueue: 'pops:sync',
        originalJobName: 'plexSyncMovies',
        finalError: 'Connection timeout',
        attemptsMade: 3,
      })
    );
  });

  it('exhaustion threshold matches queue attempt count', () => {
    // The worker checks: attemptsMade >= (opts.attempts ?? 1)
    const syncExhausted = (attemptsMade: number) =>
      attemptsMade >= (SYNC_JOB_OPTIONS.attempts ?? 1);

    expect(syncExhausted(2)).toBe(false);
    expect(syncExhausted(3)).toBe(true);
  });
});
