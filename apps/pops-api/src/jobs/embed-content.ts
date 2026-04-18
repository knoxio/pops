import { getEmbeddingsQueue } from './queue.js';

import type { EmbedJobData } from './handlers/embeddings.js';

/**
 * Enqueue an embedding job for the given source record.
 * Returns true if the job was enqueued, false if Redis is unavailable.
 *
 * Used by other modules whenever content changes and should be re-embedded:
 *   await embedContent({ sourceType: 'transactions', sourceId: tx.id });
 */
export async function embedContent(job: EmbedJobData): Promise<boolean> {
  const queue = getEmbeddingsQueue();
  if (!queue) {
    return false;
  }
  await queue.add('embed', job, { priority: 10 });
  return true;
}
