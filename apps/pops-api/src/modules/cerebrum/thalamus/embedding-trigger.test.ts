/**
 * EmbeddingTrigger tests.
 *
 * Verifies that the trigger enqueues/skips/errors correctly based on
 * `wordCount`, `contentHash` vs `previousContentHash`, and the `force` flag.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncResult } from './sync.js';

// ---------------------------------------------------------------------------
// Mock the queues module — must be hoisted so vi.mock() can reference the var.
// ---------------------------------------------------------------------------

const mockAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'job-123' }));
const mockGetEmbeddingsQueue = vi.hoisted(() => vi.fn().mockReturnValue({ add: mockAdd }));

vi.mock('../../../jobs/queues.js', () => ({
  getEmbeddingsQueue: mockGetEmbeddingsQueue,
  EMBEDDINGS_QUEUE: 'pops:embeddings',
  EMBEDDINGS_JOB_OPTIONS: {},
}));

// Import after mocking.
const { EmbeddingTrigger } = await import('./embedding-trigger.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSyncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    filePath: 'note/eng_20260419_1200_test.md',
    status: 'synced',
    engramId: 'eng_20260419_1200_test',
    contentHash: 'new-hash-abc123',
    previousContentHash: 'old-hash-xyz789',
    wordCount: 42,
    ...overrides,
  };
}

describe('EmbeddingTrigger', () => {
  let trigger: InstanceType<typeof EmbeddingTrigger>;

  beforeEach(() => {
    trigger = new EmbeddingTrigger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues job when hash has changed', async () => {
    const result = makeSyncResult({ contentHash: 'hash-a', previousContentHash: 'hash-b' });
    const triggers = await trigger.trigger([result]);

    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.action).toBe('enqueued');
    expect(mockAdd).toHaveBeenCalledOnce();
    expect(mockAdd).toHaveBeenCalledWith(
      'pops:embeddings',
      { sourceType: 'engram', sourceId: 'eng_20260419_1200_test' },
      {}
    );
  });

  it('enqueues job for new engram (no previousContentHash)', async () => {
    const result = makeSyncResult({ previousContentHash: undefined });
    const triggers = await trigger.trigger([result]);

    expect(triggers[0]?.action).toBe('enqueued');
    expect(mockAdd).toHaveBeenCalledOnce();
  });

  it('skips when hash is unchanged (no force)', async () => {
    const result = makeSyncResult({ contentHash: 'same', previousContentHash: 'same' });
    const triggers = await trigger.trigger([result]);

    expect(triggers[0]?.action).toBe('skipped');
    expect(triggers[0]?.reason).toBe('hash unchanged');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('enqueues when hash unchanged but force=true', async () => {
    const result = makeSyncResult({ contentHash: 'same', previousContentHash: 'same' });
    const triggers = await trigger.trigger([result], true);

    expect(triggers[0]?.action).toBe('enqueued');
    expect(mockAdd).toHaveBeenCalledOnce();
  });

  it('skips when wordCount is 0', async () => {
    const result = makeSyncResult({ wordCount: 0 });
    const triggers = await trigger.trigger([result]);

    expect(triggers[0]?.action).toBe('skipped');
    expect(triggers[0]?.reason).toBe('empty body');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('does not skip empty body even with force=true', async () => {
    // Empty body wins over force — there's nothing to embed.
    const result = makeSyncResult({ wordCount: 0 });
    const triggers = await trigger.trigger([result], true);

    expect(triggers[0]?.action).toBe('skipped');
    expect(triggers[0]?.reason).toBe('empty body');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('skips results with status !== synced', async () => {
    const orphaned: SyncResult = {
      filePath: 'note/deleted.md',
      status: 'orphaned',
    };
    const error: SyncResult = {
      filePath: 'note/bad.md',
      status: 'error',
      error: 'parse failed',
    };
    const triggers = await trigger.trigger([orphaned, error]);

    expect(triggers).toHaveLength(0);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('handles queue error gracefully, returning action: error', async () => {
    mockAdd.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = makeSyncResult();
    const triggers = await trigger.trigger([result]);

    expect(triggers[0]?.action).toBe('error');
    expect(triggers[0]?.reason).toContain('Redis unavailable');
  });

  it('processes multiple results in one call', async () => {
    const r1 = makeSyncResult({
      engramId: 'eng_1',
      contentHash: 'a',
      previousContentHash: 'b',
      filePath: 'note/e1.md',
    });
    const r2 = makeSyncResult({
      engramId: 'eng_2',
      contentHash: 'same',
      previousContentHash: 'same',
      filePath: 'note/e2.md',
    });
    const r3 = makeSyncResult({
      engramId: 'eng_3',
      wordCount: 0,
      filePath: 'note/e3.md',
    });

    const triggers = await trigger.trigger([r1, r2, r3]);
    expect(triggers).toHaveLength(3);
    expect(triggers[0]?.action).toBe('enqueued');
    expect(triggers[1]?.action).toBe('skipped');
    expect(triggers[2]?.action).toBe('skipped');
    expect(mockAdd).toHaveBeenCalledOnce();
  });
});
