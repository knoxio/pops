/**
 * BullMQ job handler for embedding generation.
 *
 * Processes jobs from the `pops:embeddings` queue. Each job embeds the content
 * of a source record, storing vectors in embeddings_vec and metadata in embeddings.
 */
import { and, eq, gt } from 'drizzle-orm';

import { aiUsage, embeddings } from '@pops/db-types';

import { getDrizzle, getDb, isVecAvailable } from '../../db.js';
import { chunkText, hashContent, CONTENT_PREVIEW_LENGTH } from '../../shared/chunker.js';
import {
  getEmbeddingConfig,
  getEmbedding,
  estimateEmbeddingCost,
} from '../../shared/embedding-client.js';
import { getRedis, isRedisAvailable, redisKey } from '../../shared/redis-client.js';

import type { Job } from 'bullmq';

import type { EmbeddingsQueueJobData } from '../types.js';

export type { EmbeddingsQueueJobData as EmbedJobData };

interface EmbedJobResult {
  chunksProcessed: number;
  chunksSkipped: number;
  chunksDeleted: number;
}

const VECTOR_CACHE_TTL_SECONDS = 86400; // 24 hours

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
    // No content — delete any existing embeddings for this source
    await deleteEmbeddingsForSource(sourceType, sourceId);
    return { chunksProcessed: 0, chunksSkipped: 0, chunksDeleted: 0 };
  }

  const chunks = chunkText(text);
  const config = getEmbeddingConfig();
  const db = getDrizzle();
  const rawDb = getDb();
  const redis = isRedisAvailable() ? getRedis() : null;

  let chunksProcessed = 0;
  let chunksSkipped = 0;
  let totalTokensUsed = 0;

  for (const chunk of chunks) {
    const contentHash = hashContent(chunk.text);
    const contentPreview = chunk.text.slice(0, CONTENT_PREVIEW_LENGTH);

    // Check if an up-to-date embedding already exists for this chunk
    const existing = db
      .select({ id: embeddings.id, contentHash: embeddings.contentHash })
      .from(embeddings)
      .where(
        and(
          eq(embeddings.sourceType, sourceType),
          eq(embeddings.sourceId, sourceId),
          eq(embeddings.chunkIndex, chunk.index)
        )
      )
      .get();

    if (existing?.contentHash === contentHash) {
      chunksSkipped++;
      continue;
    }

    // Check Redis cache: content_hash → serialised vector bytes
    const vectorCacheKey = redisKey('vec', contentHash);
    let vector: number[] | null = null;

    if (redis) {
      const cached = await redis.getBuffer(vectorCacheKey);
      if (cached) {
        // Stored as little-endian Float32Array bytes
        const floats = new Float32Array(cached.buffer, cached.byteOffset, cached.byteLength / 4);
        vector = Array.from(floats);
      }
    }

    if (!vector) {
      vector = await getEmbedding(chunk.text, config);
      // Approximate token count from character length
      totalTokensUsed += Math.ceil(chunk.text.length / 4);

      if (redis) {
        const buf = Buffer.from(new Float32Array(vector).buffer);
        await redis.set(vectorCacheKey, buf, 'EX', VECTOR_CACHE_TTL_SECONDS);
      }
    }

    const vectorBlob = Buffer.from(new Float32Array(vector).buffer);

    if (existing) {
      // Update existing row
      db.update(embeddings)
        .set({
          contentHash,
          contentPreview,
          model: config.model,
          dimensions: config.dimensions,
          createdAt: new Date().toISOString(),
        })
        .where(eq(embeddings.id, existing.id))
        .run();

      // Update vector in embeddings_vec
      rawDb.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(existing.id);
      rawDb
        .prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)')
        .run(existing.id, vectorBlob);
    } else {
      // Insert new embedding metadata row
      const result = db
        .insert(embeddings)
        .values({
          sourceType,
          sourceId,
          chunkIndex: chunk.index,
          contentHash,
          contentPreview,
          model: config.model,
          dimensions: config.dimensions,
          createdAt: new Date().toISOString(),
        })
        .returning({ id: embeddings.id })
        .get();

      // Insert vector row — rowid must match embeddings.id
      rawDb
        .prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)')
        .run(result.id, vectorBlob);
    }

    chunksProcessed++;
  }

  // Delete orphaned chunks whose chunk_index is beyond the new chunk count
  const orphans = db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.sourceType, sourceType),
        eq(embeddings.sourceId, sourceId),
        gt(embeddings.chunkIndex, chunks.length - 1)
      )
    )
    .all();

  for (const orphan of orphans) {
    rawDb.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(orphan.id);
  }

  const chunksDeleted = db
    .delete(embeddings)
    .where(
      and(
        eq(embeddings.sourceType, sourceType),
        eq(embeddings.sourceId, sourceId),
        gt(embeddings.chunkIndex, chunks.length - 1)
      )
    )
    .run().changes;

  // Track API usage if any API calls were made
  if (totalTokensUsed > 0) {
    const costUsd = estimateEmbeddingCost(totalTokensUsed, config.model);
    db.insert(aiUsage)
      .values({
        description: `${sourceType}:${sourceId}`,
        category: 'embeddings',
        inputTokens: totalTokensUsed,
        outputTokens: 0,
        costUsd,
        cached: 0,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  return { chunksProcessed, chunksSkipped, chunksDeleted };
}

/**
 * Fetch content for a source record.
 * Returns null if the source type is unregistered or the record doesn't exist.
 *
 * Extend this function when adding new embeddable content types.
 */
async function fetchContent(sourceType: string, sourceId: string): Promise<string | null> {
  const db = getDb();

  switch (sourceType) {
    case 'transactions': {
      const row = db
        .prepare('SELECT description, notes FROM transactions WHERE id = ?')
        .get(sourceId) as { description: string; notes: string | null } | undefined;
      if (!row) return null;
      return [row.description, row.notes].filter(Boolean).join('\n');
    }

    default:
      return null;
  }
}

/** Delete all embeddings (metadata + vectors) for a given source record. */
async function deleteEmbeddingsForSource(sourceType: string, sourceId: string): Promise<void> {
  const db = getDrizzle();
  const rawDb = getDb();

  const rows = db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(and(eq(embeddings.sourceType, sourceType), eq(embeddings.sourceId, sourceId)))
    .all();

  for (const row of rows) {
    rawDb.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(row.id);
  }

  db.delete(embeddings)
    .where(and(eq(embeddings.sourceType, sourceType), eq(embeddings.sourceId, sourceId)))
    .run();
}

/**
 * Periodic cleanup job: remove embeddings whose source record no longer exists.
 *
 * Schedule this as a BullMQ repeatable job (PRD-074) once the worker is set up.
 * For each known source type, deletes embeddings with no matching source row.
 */
export async function cleanupOrphanedEmbeddings(): Promise<{ deleted: number }> {
  const rawDb = getDb();

  // Only handles registered source types
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
