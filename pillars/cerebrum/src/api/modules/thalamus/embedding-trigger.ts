/**
 * EmbeddingTrigger — decides whether a synced engram should have its
 * embeddings regenerated and enqueues the job.
 *
 * Rules:
 *  - Skip if `wordCount === 0` (empty body — nothing to embed).
 *  - Skip (unless `force`) if `contentHash === previousContentHash` (no change).
 *  - Enqueue `{ sourceType: 'engram', sourceId, content }` to `pops-embeddings`.
 *  - If the queue is unavailable (no Redis), report `action: 'skipped'` with a
 *    queue-unavailable reason — a missing producer is soft, never an error.
 */
import { EMBEDDINGS_JOB_OPTIONS, type EmbeddingsQueueAccessor } from './queue.js';

import type { SyncResult } from './sync.js';

export interface TriggerResult {
  engramId: string;
  action: 'enqueued' | 'skipped' | 'error';
  reason: string;
}

export class EmbeddingTrigger {
  constructor(private readonly queueAccessor: EmbeddingsQueueAccessor) {}

  async trigger(results: SyncResult[], force = false): Promise<TriggerResult[]> {
    const output: TriggerResult[] = [];

    for (const result of results) {
      if (result.status !== 'synced' || result.engramId === undefined) continue;

      const engramId = result.engramId;

      if (result.wordCount === 0) {
        output.push({ engramId, action: 'skipped', reason: 'empty body' });
        continue;
      }

      if (!force && result.contentHash === result.previousContentHash) {
        output.push({ engramId, action: 'skipped', reason: 'hash unchanged' });
        continue;
      }

      const queue = this.queueAccessor();
      if (!queue) {
        output.push({
          engramId,
          action: 'skipped',
          reason: 'embeddings queue unavailable — Redis not configured',
        });
        continue;
      }

      try {
        await queue.add(
          'embed',
          { sourceType: 'engram', sourceId: engramId, content: result.bodyText },
          EMBEDDINGS_JOB_OPTIONS
        );
        output.push({ engramId, action: 'enqueued', reason: 'content changed' });
      } catch (err) {
        console.error(`[thalamus] Failed to enqueue embedding job for ${engramId}:`, err);
        output.push({ engramId, action: 'error', reason: (err as Error).message });
      }
    }

    return output;
  }
}
