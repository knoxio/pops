/**
 * BullMQ job handler for embedding generation.
 *
 * Processes jobs from the `pops-embeddings` queue. Each job embeds the content
 * of a source record, storing vectors in embeddings_vec and metadata in embeddings.
 */
import { getDb, isVecAvailable } from '../../db.js';
import { chunkText } from '../../shared/chunker.js';
import { getEmbeddingConfig } from '../../shared/embedding-client.js';
import {
  deleteEmbeddingsForSource,
  fetchContent,
  processChunk,
  pruneOrphanChunks,
  recordEmbeddingUsage,
} from './embeddings-helpers.js';

import type { Job } from 'bullmq';

import type { EmbeddingsQueueJobData } from '../types.js';

export type { EmbeddingsQueueJobData as EmbedJobData };

interface EmbedJobResult {
  chunksProcessed: number;
  chunksSkipped: number;
  chunksDeleted: number;
}

/** BullMQ entry point — delegates to processEmbeddingJob. */
export async function process(job: Job<EmbeddingsQueueJobData>): Promise<EmbedJobResult> {
  return processEmbeddingJob(job.data);
}

/**
 * Process a single embedding job.
 *
 * Steps:
 * 1. Chunk content into max-512-token segments with 50-token overlap
 * 2. Hash each chunk — skip if hash matches existing embedding (content unchanged)
 * 3. Check Redis cache (content_hash → vector) before calling the embedding API
 * 4. Store new/changed vectors in embeddings_vec and metadata in embeddings
 * 5. Delete orphaned chunks (chunk_index beyond the new chunk count)
 * 6. Track embedding API usage in ai_usage
 */
export async function processEmbeddingJob(job: EmbeddingsQueueJobData): Promise<EmbedJobResult> {
  const { sourceType, sourceId, content } = job;

  if (!isVecAvailable()) {
    throw new Error('sqlite-vec extension not available — cannot store vectors');
  }

  const text = content ?? (await fetchContent(sourceType, sourceId));
  if (!text?.trim()) {
    await deleteEmbeddingsForSource(sourceType, sourceId);
    return { chunksProcessed: 0, chunksSkipped: 0, chunksDeleted: 0 };
  }

  const chunks = chunkText(text);
  const config = getEmbeddingConfig();
  const ctx = { sourceType, sourceId, config };

  let chunksProcessed = 0;
  let chunksSkipped = 0;
  let totalTokensUsed = 0;

  for (const chunk of chunks) {
    const result = await processChunk(ctx, chunk);
    if (result.processed) chunksProcessed++;
    else chunksSkipped++;
    totalTokensUsed += result.tokensUsed;
  }

  const chunksDeleted = pruneOrphanChunks(sourceType, sourceId, chunks.length);
  recordEmbeddingUsage(sourceType, sourceId, totalTokensUsed, config.model);

  return { chunksProcessed, chunksSkipped, chunksDeleted };
}

/**
 * Periodic cleanup job: remove embeddings whose source record no longer exists.
 *
 * Schedule this as a BullMQ repeatable job (PRD-074) once the worker is set up.
 * For each known source type, deletes embeddings with no matching source row.
 */
export async function cleanupOrphanedEmbeddings(): Promise<{ deleted: number }> {
  const rawDb = getDb();

  const orphans = rawDb
    .prepare(
      `SELECT e.id FROM embeddings e
       LEFT JOIN transactions t ON t.id = e.source_id AND e.source_type = 'transactions'
       WHERE e.source_type = 'transactions' AND t.id IS NULL`
    )
    .all() as { id: number }[];

  for (const orphan of orphans) {
    rawDb.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(orphan.id);
  }

  const result = rawDb
    .prepare(
      `DELETE FROM embeddings WHERE id IN (
         SELECT e.id FROM embeddings e
         LEFT JOIN transactions t ON t.id = e.source_id AND e.source_type = 'transactions'
         WHERE e.source_type = 'transactions' AND t.id IS NULL
       )`
    )
    .run();

  return { deleted: result.changes };
}
