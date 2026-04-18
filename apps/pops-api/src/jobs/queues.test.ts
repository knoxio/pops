import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted ensures these are available when vi.mock factory runs
const { MockQueue, mockClose } = vi.hoisted(() => {
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const MockQueue = vi.fn(function (this: Record<string, unknown>, name: string, opts: object) {
    this.name = name;
    this.opts = opts;
    this.close = mockClose;
  });
  return { MockQueue, mockClose };
});

vi.mock('bullmq', () => ({ Queue: MockQueue }));
vi.mock('./redis.js', () => ({ createRedisConnection: vi.fn().mockReturnValue({}) }));

import {
  CURATION_JOB_OPTIONS,
  CURATION_QUEUE,
  DEAD_LETTER_QUEUE,
  DEFAULT_JOB_OPTIONS,
  DEFAULT_QUEUE,
  EMBEDDINGS_JOB_OPTIONS,
  EMBEDDINGS_QUEUE,
  SYNC_JOB_OPTIONS,
  SYNC_QUEUE,
  closeQueues,
  getCurationQueue,
  getDeadLetterQueue,
  getDefaultQueue,
  getEmbeddingsQueue,
  getQueueByName,
  getSyncQueue,
} from './queues.js';

beforeEach(async () => {
  await closeQueues();
  vi.clearAllMocks();
  mockClose.mockResolvedValue(undefined);
});

describe('queue creation succeeds when Redis is available', () => {
  it('getSyncQueue returns a queue with correct name and retry options', () => {
    const q = getSyncQueue();
    expect(MockQueue).toHaveBeenCalledWith(
      SYNC_QUEUE,
      expect.objectContaining({ defaultJobOptions: SYNC_JOB_OPTIONS })
    );
    expect((q as { name: string }).name).toBe(SYNC_QUEUE);
    expect(SYNC_JOB_OPTIONS.attempts).toBeGreaterThan(1);
    expect(SYNC_JOB_OPTIONS.backoff).toMatchObject({ type: 'exponential' });
  });

  it('getEmbeddingsQueue returns a queue with correct name and retry options', () => {
    const q = getEmbeddingsQueue();
    expect((q as { name: string }).name).toBe(EMBEDDINGS_QUEUE);
    expect(EMBEDDINGS_JOB_OPTIONS.attempts).toBeGreaterThan(1);
  });

  it('getCurationQueue returns a queue with correct name and retry options', () => {
    const q = getCurationQueue();
    expect((q as { name: string }).name).toBe(CURATION_QUEUE);
    expect(CURATION_JOB_OPTIONS.attempts).toBeGreaterThan(0);
  });

  it('getDefaultQueue returns a queue with correct name and retry options', () => {
    const q = getDefaultQueue();
    expect((q as { name: string }).name).toBe(DEFAULT_QUEUE);
    expect(DEFAULT_JOB_OPTIONS.attempts).toBeGreaterThan(1);
  });

  it('getDeadLetterQueue returns a dead-letter queue', () => {
    const q = getDeadLetterQueue();
    expect((q as { name: string }).name).toBe(DEAD_LETTER_QUEUE);
  });

  it('queue getters return the same singleton on repeated calls', () => {
    const q1 = getSyncQueue();
    const q2 = getSyncQueue();
    expect(q1).toBe(q2);
    expect(MockQueue).toHaveBeenCalledTimes(1);
  });

  it('all queue names are prefixed with pops:', () => {
    expect(SYNC_QUEUE).toMatch(/^pops:/);
    expect(EMBEDDINGS_QUEUE).toMatch(/^pops:/);
    expect(CURATION_QUEUE).toMatch(/^pops:/);
    expect(DEFAULT_QUEUE).toMatch(/^pops:/);
    expect(DEAD_LETTER_QUEUE).toMatch(/^pops:/);
  });

  it('all queues retain failed jobs so they can be dead-lettered', () => {
    expect(SYNC_JOB_OPTIONS.removeOnFail).toBe(false);
    expect(EMBEDDINGS_JOB_OPTIONS.removeOnFail).toBe(false);
    expect(CURATION_JOB_OPTIONS.removeOnFail).toBe(false);
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(false);
  });
});

describe('queue creation throws descriptively when Redis is unavailable', () => {
  it('propagates the connection error without swallowing it', () => {
    MockQueue.mockImplementationOnce(() => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
    });
    expect(() => getSyncQueue()).toThrow('ECONNREFUSED');
  });
});

describe('getQueueByName', () => {
  it('returns each known queue by name', () => {
    expect(getQueueByName(SYNC_QUEUE)).not.toBeNull();
    expect(getQueueByName(EMBEDDINGS_QUEUE)).not.toBeNull();
    expect(getQueueByName(CURATION_QUEUE)).not.toBeNull();
    expect(getQueueByName(DEFAULT_QUEUE)).not.toBeNull();
    expect(getQueueByName(DEAD_LETTER_QUEUE)).not.toBeNull();
  });

  it('returns null for unknown queue names', () => {
    expect(getQueueByName('unknown:queue')).toBeNull();
    expect(getQueueByName('')).toBeNull();
  });
});

describe('closeQueues', () => {
  it('calls close on every open queue and resets singletons', async () => {
    getSyncQueue();
    getEmbeddingsQueue();
    getCurationQueue();
    getDefaultQueue();
    getDeadLetterQueue();

    await closeQueues();

    expect(mockClose).toHaveBeenCalledTimes(5);

    // After closing, the next getter call creates a fresh instance
    vi.clearAllMocks();
    getSyncQueue();
    expect(MockQueue).toHaveBeenCalledTimes(1);
  });
});
