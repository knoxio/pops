/**
 * EmbeddingTrigger — decides whether a synced engram should have its
 * embeddings regenerated and enqueues the job.
 *
 * Rules:
 *  - Skip if `wordCount === 0` (empty body — nothing to embed).
 *  - Skip (unless `force`) if `contentHash === previousContentHash` (no change).
 *  - Enqueue `{ sourceType: 'engram', sourceId: engramId }` to pops-embeddings.
 *  - If BullMQ is unavailable, log the error and return `action: 'error'`.
 */
import {
  EMBEDDINGS_JOB_OPTIONS,
  EMBEDDINGS_QUEUE,
  getEmbeddingsQueue,
} from '../../../jobs/queues.js';

import type { SyncResult } from './sync.js';

export interface TriggerResult {
  engramId: string;
  action: 'enqueued' | 'skipped' | 'error';
  reason: string;
}

export class EmbeddingTrigger {
  async trigger(results: SyncResult[], force = false): Promise<TriggerResult[]> {
    const output: TriggerResult[] = [];

    for (const result of results) {
      if (result.status !== 'synced' || !result.engramId) continue;

      const engramId = result.engramId;

      if (result.wordCount === 0) {
        output.push({ engramId, action: 'skipped', reason: 'empty body' });
        continue;
      }

      if (!force && result.contentHash === result.previousContentHash) {
        output.push({ engramId, action: 'skipped', reason: 'hash unchanged' });
        continue;
      }

      try {
        const queue = getEmbeddingsQueue();
        await queue.add(
          EMBEDDINGS_QUEUE,
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
