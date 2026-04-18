import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupTestContext } from '../../../shared/test-utils.js';

// ---------------------------------------------------------------------------
// Hoisted mock data — these run before vi.mock() factories
// ---------------------------------------------------------------------------

const {
  mockSyncJob,
  mockDlqJob,
  mockSyncQueue,
  mockDeadLetterQueue,
  mockEmbeddingsQueue,
  mockCurationQueue,
  mockDefaultQueue,
} = vi.hoisted(() => {
  function makeMockJob(overrides: Record<string, unknown> = {}) {
    return {
      id: 'job-1',
      name: 'testJob',
      data: { type: 'plexSyncMovies' },
      progress: 0,
      attemptsMade: 0,
      opts: { attempts: 3 },
      failedReason: null,
      processedOn: null,
      finishedOn: null,
      timestamp: Date.now(),
      returnvalue: null,
      stacktrace: [],
      getState: vi.fn().mockResolvedValue('failed'),
      retry: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      discard: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  const mockSyncJob = makeMockJob();
  const mockDlqJob = makeMockJob({
    id: 'dlq-1',
    name: 'pops:dead-letter',
    data: {
      originalQueue: 'pops:sync',
      originalJobName: 'syncJob',
      originalData: { type: 'plexSyncMovies' },
    },
  });

  const mockSyncQueue = {
    name: 'pops:sync',
    getJobs: vi.fn().mockResolvedValue([mockSyncJob]),
    getJob: vi.fn().mockResolvedValue(mockSyncJob),
    getJobCounts: vi.fn().mockResolvedValue({
      waiting: 2,
      active: 1,
      completed: 10,
      failed: 0,
      delayed: 0,
      paused: 0,
    }),
    drain: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue({ id: 'new-job-1' }),
    getJobSchedulers: vi.fn().mockResolvedValue([]),
  };

  const mockDeadLetterQueue = {
    name: 'pops:dead-letter',
    getJobs: vi.fn().mockResolvedValue([mockDlqJob]),
    getJob: vi.fn().mockResolvedValue(mockDlqJob),
    getJobCounts: vi
      .fn()
      .mockResolvedValue({ waiting: 1, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 }),
    drain: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue({ id: 'dlq-new-1' }),
  };

  const makeSimpleQueue = (name: string) => ({
    name,
    getJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn().mockResolvedValue(null),
    getJobCounts: vi
      .fn()
      .mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 }),
    drain: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue({ id: 'generic-1' }),
  });

  const mockEmbeddingsQueue = makeSimpleQueue('pops:embeddings');
  const mockCurationQueue = makeSimpleQueue('pops:curation');
  const mockDefaultQueue = makeSimpleQueue('pops:default');

  return {
    mockSyncJob,
    mockDlqJob,
    mockSyncQueue,
    mockDeadLetterQueue,
    mockEmbeddingsQueue,
    mockCurationQueue,
    mockDefaultQueue,
  };
});

vi.mock('../../../jobs/queues.js', () => {
  const ALL_QUEUES = ['pops:sync', 'pops:embeddings', 'pops:curation', 'pops:default'] as const;
  const DEAD_LETTER_QUEUE = 'pops:dead-letter';

  const queueMap: Record<string, unknown> = {
    'pops:sync': mockSyncQueue,
    'pops:embeddings': mockEmbeddingsQueue,
    'pops:curation': mockCurationQueue,
    'pops:default': mockDefaultQueue,
    'pops:dead-letter': mockDeadLetterQueue,
  };

  return {
    ALL_QUEUES,
    DEAD_LETTER_QUEUE,
    getSyncQueue: () => mockSyncQueue,
    getDeadLetterQueue: () => mockDeadLetterQueue,
    getQueueByName: (name: string) => queueMap[name] ?? null,
  };
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const ctx = setupTestContext();

describe('jobs router', () => {
  let caller: ReturnType<typeof ctx.setup>['caller'];

  beforeEach(() => {
    const result = ctx.setup();
    caller = result.caller;
    vi.clearAllMocks();
    mockSyncQueue.getJobs.mockResolvedValue([mockSyncJob]);
    mockSyncQueue.getJob.mockResolvedValue(mockSyncJob);
    mockSyncQueue.getJobCounts.mockResolvedValue({
      waiting: 2,
      active: 1,
      completed: 10,
      failed: 0,
      delayed: 0,
      paused: 0,
    });
    mockSyncQueue.drain.mockResolvedValue(undefined);
    mockSyncQueue.add.mockResolvedValue({ id: 'new-job-1' });
    mockSyncQueue.getJobSchedulers.mockResolvedValue([]);
    mockDeadLetterQueue.getJobs.mockResolvedValue([mockDlqJob]);
    mockDeadLetterQueue.getJob.mockResolvedValue(mockDlqJob);
    mockDeadLetterQueue.getJobCounts.mockResolvedValue({
      waiting: 1,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    });
    mockDeadLetterQueue.add.mockResolvedValue({ id: 'dlq-new-1' });
    mockDlqJob.remove.mockResolvedValue(undefined);
    mockSyncJob.retry.mockResolvedValue(undefined);
    mockSyncJob.remove.mockResolvedValue(undefined);
    mockSyncJob.discard.mockResolvedValue(undefined);
    mockSyncJob.getState.mockResolvedValue('failed');
    for (const q of [mockEmbeddingsQueue, mockCurationQueue, mockDefaultQueue]) {
      q.getJobs.mockResolvedValue([]);
      q.getJobCounts.mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      });
    }
  });

  afterEach(() => {
    ctx.teardown();
  });

  // --------------------------------------------------------------------------
  // list
  // --------------------------------------------------------------------------

  describe('list', () => {
    it('returns jobs across all queues', async () => {
      const res = await caller.core.jobs.list({});
      expect(res.jobs.length).toBeGreaterThan(0);
      expect(res.total).toBeGreaterThan(0);
    });

    it('filters by queue name', async () => {
      const res = await caller.core.jobs.list({ queue: 'pops:sync' });
      expect(res.jobs.every((j) => j.queue === 'pops:sync')).toBe(true);
    });

    it('returns empty list for unknown queue', async () => {
      const res = await caller.core.jobs.list({ queue: 'unknown:queue' });
      expect(res.jobs).toHaveLength(0);
      expect(res.total).toBe(0);
    });

    it('respects limit and offset', async () => {
      mockSyncQueue.getJobs.mockResolvedValue([
        { ...mockSyncJob, id: 'j1' },
        { ...mockSyncJob, id: 'j2' },
        { ...mockSyncJob, id: 'j3' },
      ]);
      const res = await caller.core.jobs.list({ queue: 'pops:sync', limit: 2, offset: 0 });
      expect(res.jobs).toHaveLength(2);
      expect(res.total).toBe(3);
    });

    it('serialises job fields correctly', async () => {
      const res = await caller.core.jobs.list({ queue: 'pops:sync' });
      const job = res.jobs[0]!;
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('name');
      expect(job).toHaveProperty('queue');
      expect(job).toHaveProperty('attempts');
      expect(job).toHaveProperty('maxAttempts');
      expect(job).toHaveProperty('failedReason');
    });
  });

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('returns full job details for a known job', async () => {
      const res = await caller.core.jobs.get({ jobId: 'job-1', queue: 'pops:sync' });
      expect(res.job.id).toBe('job-1');
      expect(res.job.queue).toBe('pops:sync');
    });

    it('throws NOT_FOUND when job does not exist', async () => {
      mockSyncQueue.getJob.mockResolvedValue(null);
      await expect(caller.core.jobs.get({ jobId: 'missing', queue: 'pops:sync' })).rejects.toThrow(
        'Job not found'
      );
    });

    it('throws BAD_REQUEST for unknown queue', async () => {
      await expect(caller.core.jobs.get({ jobId: 'job-1', queue: 'pops:unknown' })).rejects.toThrow(
        'Unknown queue'
      );
    });
  });

  // --------------------------------------------------------------------------
  // retry
  // --------------------------------------------------------------------------

  describe('retry', () => {
    it('retries a failed job in a known queue', async () => {
      const res = await caller.core.jobs.retry({ jobId: 'job-1', queue: 'pops:sync' });
      expect(res.success).toBe(true);
      expect(mockSyncJob.retry).toHaveBeenCalled();
    });

    it('re-enqueues a dead-letter job to its original queue', async () => {
      const res = await caller.core.jobs.retry({ jobId: 'dlq-1', queue: 'pops:dead-letter' });
      expect(res.success).toBe(true);
      expect(mockSyncQueue.add).toHaveBeenCalledWith('syncJob', expect.anything());
      expect(mockDlqJob.remove).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when dead-letter job is missing', async () => {
      mockDeadLetterQueue.getJob.mockResolvedValue(null);
      await expect(
        caller.core.jobs.retry({ jobId: 'missing', queue: 'pops:dead-letter' })
      ).rejects.toThrow('Dead-letter job not found');
    });

    it('throws BAD_REQUEST when dead-letter job lacks originalQueue', async () => {
      mockDeadLetterQueue.getJob.mockResolvedValue({
        ...mockDlqJob,
        data: { originalData: {} },
        remove: vi.fn(),
      });
      await expect(
        caller.core.jobs.retry({ jobId: 'dlq-1', queue: 'pops:dead-letter' })
      ).rejects.toThrow('Missing originalQueue');
    });
  });

  // --------------------------------------------------------------------------
  // cancel
  // --------------------------------------------------------------------------

  describe('cancel', () => {
    it('removes a waiting job', async () => {
      mockSyncJob.getState.mockResolvedValue('waiting');
      const res = await caller.core.jobs.cancel({ jobId: 'job-1', queue: 'pops:sync' });
      expect(res.success).toBe(true);
      expect(mockSyncJob.remove).toHaveBeenCalled();
    });

    it('discards an active job', async () => {
      mockSyncJob.getState.mockResolvedValue('active');
      const res = await caller.core.jobs.cancel({ jobId: 'job-1', queue: 'pops:sync' });
      expect(res.success).toBe(true);
      expect(mockSyncJob.discard).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when job does not exist', async () => {
      mockSyncQueue.getJob.mockResolvedValue(null);
      await expect(
        caller.core.jobs.cancel({ jobId: 'missing', queue: 'pops:sync' })
      ).rejects.toThrow('Job not found');
    });
  });

  // --------------------------------------------------------------------------
  // drain
  // --------------------------------------------------------------------------

  describe('drain', () => {
    it('drains a queue and returns the count of removed waiting jobs', async () => {
      const res = await caller.core.jobs.drain({ queue: 'pops:sync', confirm: true });
      expect(res.drained).toBe(2);
      expect(mockSyncQueue.drain).toHaveBeenCalled();
    });

    it('throws BAD_REQUEST for unknown queue', async () => {
      await expect(
        caller.core.jobs.drain({ queue: 'unknown:queue', confirm: true })
      ).rejects.toThrow('Unknown queue');
    });
  });

  // --------------------------------------------------------------------------
  // queueStats
  // --------------------------------------------------------------------------

  describe('queueStats', () => {
    it('returns counts for all queues including dead-letter', async () => {
      const res = await caller.core.jobs.queueStats();
      const queueNames = res.queues.map((q) => q.queue);
      expect(queueNames).toContain('pops:sync');
      expect(queueNames).toContain('pops:dead-letter');
    });

    it('includes waiting and active counts in each queue entry', async () => {
      const res = await caller.core.jobs.queueStats();
      const syncStats = res.queues.find((q) => q.queue === 'pops:sync');
      expect(syncStats?.counts).toMatchObject({ waiting: 2, active: 1 });
    });
  });

  // --------------------------------------------------------------------------
  // schedulers
  // --------------------------------------------------------------------------

  describe('schedulers', () => {
    it('returns an empty list when no schedulers are configured', async () => {
      const res = await caller.core.jobs.schedulers();
      expect(res.schedulers).toEqual([]);
    });

    it('returns schedulers from the sync queue', async () => {
      const fakeScheduler = { key: 'plexScheduledSync', name: 'plexScheduledSync' };
      mockSyncQueue.getJobSchedulers.mockResolvedValue([fakeScheduler]);
      const res = await caller.core.jobs.schedulers();
      expect(res.schedulers).toHaveLength(1);
    });
  });
});
