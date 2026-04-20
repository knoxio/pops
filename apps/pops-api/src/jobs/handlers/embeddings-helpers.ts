import { and, eq, gt } from 'drizzle-orm';

import { aiUsage, embeddings } from '@pops/db-types';

import { getDb, getDrizzle } from '../../db.js';
import { CONTENT_PREVIEW_LENGTH, hashContent } from '../../shared/chunker.js';
import {
  estimateEmbeddingCost,
  getEmbedding,
  type EmbeddingConfig,
} from '../../shared/embedding-client.js';
import { getRedis, isRedisAvailable, redisKey } from '../../shared/redis-client.js';

import type { TextChunk } from '../../shared/chunker.js';

const VECTOR_CACHE_TTL_SECONDS = 86400;

export interface ChunkContext {
  sourceType: string;
  sourceId: string;
  config: EmbeddingConfig;
}

interface ExistingEmbedding {
  id: number;
  contentHash: string;
}

function loadExisting(ctx: ChunkContext, chunkIndex: number): ExistingEmbedding | undefined {
  const db = getDrizzle();
  return db
    .select({ id: embeddings.id, contentHash: embeddings.contentHash })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.sourceType, ctx.sourceType),
        eq(embeddings.sourceId, ctx.sourceId),
        eq(embeddings.chunkIndex, chunkIndex)
      )
    )
    .get();
}

async function readVectorFromCache(contentHash: string): Promise<number[] | null> {
  if (!isRedisAvailable()) return null;
  const redis = getRedis();
  if (!redis) return null;
  const cached = await redis.getBuffer(redisKey('vec', contentHash));
  if (!cached) return null;
  const floats = new Float32Array(cached.buffer, cached.byteOffset, cached.byteLength / 4);
  return Array.from(floats);
}

async function writeVectorToCache(contentHash: string, vector: number[]): Promise<void> {
  if (!isRedisAvailable()) return;
  const redis = getRedis();
  if (!redis) return;
  const buf = Buffer.from(new Float32Array(vector).buffer);
  await redis.set(redisKey('vec', contentHash), buf, 'EX', VECTOR_CACHE_TTL_SECONDS);
}

export interface EmbedResult {
  vector: number[];
  tokensUsed: number;
}

export async function obtainEmbedding(
  text: string,
  contentHash: string,
  config: EmbeddingConfig
): Promise<EmbedResult> {
  const cached = await readVectorFromCache(contentHash);
  if (cached) return { vector: cached, tokensUsed: 0 };

  const vector = await getEmbedding(text, config);
  const tokensUsed = Math.ceil(text.length / 4);
  await writeVectorToCache(contentHash, vector);
  return { vector, tokensUsed };
}

function persistVector(rowId: number, vector: number[]): void {
  const rawDb = getDb();
  const vectorBlob = Buffer.from(new Float32Array(vector).buffer);
  rawDb.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(rowId);
  rawDb.prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)').run(rowId, vectorBlob);
}

export interface UpsertChunkArgs {
  ctx: ChunkContext;
  chunk: TextChunk;
  contentHash: string;
  contentPreview: string;
  vector: number[];
  existing: ExistingEmbedding | undefined;
}

export function upsertChunkEmbedding(args: UpsertChunkArgs): void {
  const { ctx, chunk, contentHash, contentPreview, vector, existing } = args;
  const db = getDrizzle();
  const now = new Date().toISOString();

  if (existing) {
    db.update(embeddings)
      .set({
        contentHash,
        contentPreview,
        model: ctx.config.model,
        dimensions: ctx.config.dimensions,
        createdAt: now,
      })
      .where(eq(embeddings.id, existing.id))
      .run();
    persistVector(existing.id, vector);
    return;
  }

  const result = db
    .insert(embeddings)
    .values({
      sourceType: ctx.sourceType,
      sourceId: ctx.sourceId,
      chunkIndex: chunk.index,
      contentHash,
      contentPreview,
      model: ctx.config.model,
      dimensions: ctx.config.dimensions,
      createdAt: now,
    })
    .returning({ id: embeddings.id })
    .get();

  const rawDb = getDb();
  const vectorBlob = Buffer.from(new Float32Array(vector).buffer);
  rawDb
    .prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)')
    .run(result.id, vectorBlob);
}

export interface ProcessChunkResult {
  processed: boolean;
  tokensUsed: number;
}

export async function processChunk(
  ctx: ChunkContext,
  chunk: TextChunk
): Promise<ProcessChunkResult> {
  const contentHash = hashContent(chunk.text);
  const contentPreview = chunk.text.slice(0, CONTENT_PREVIEW_LENGTH);
  const existing = loadExisting(ctx, chunk.index);

  if (existing?.contentHash === contentHash) {
    return { processed: false, tokensUsed: 0 };
  }

  const { vector, tokensUsed } = await obtainEmbedding(chunk.text, contentHash, ctx.config);
  upsertChunkEmbedding({ ctx, chunk, contentHash, contentPreview, vector, existing });
  return { processed: true, tokensUsed };
}

export function pruneOrphanChunks(
  sourceType: string,
  sourceId: string,
  validChunkCount: number
): number {
  const db = getDrizzle();
  const rawDb = getDb();

  const orphans = db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.sourceType, sourceType),
        eq(embeddings.sourceId, sourceId),
        gt(embeddings.chunkIndex, validChunkCount - 1)
      )
    )
    .all();

  for (const orphan of orphans) {
    rawDb.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(orphan.id);
  }

  return db
    .delete(embeddings)
    .where(
      and(
        eq(embeddings.sourceType, sourceType),
        eq(embeddings.sourceId, sourceId),
        gt(embeddings.chunkIndex, validChunkCount - 1)
      )
    )
    .run().changes;
}

export function recordEmbeddingUsage(
  sourceType: string,
  sourceId: string,
  totalTokens: number,
  model: string
): void {
  if (totalTokens <= 0) return;

  const db = getDrizzle();
  const costUsd = estimateEmbeddingCost(totalTokens, model);
  db.insert(aiUsage)
    .values({
      description: `${sourceType}:${sourceId}`,
      category: 'embeddings',
      inputTokens: totalTokens,
      outputTokens: 0,
      costUsd,
      cached: 0,
      createdAt: new Date().toISOString(),
    })
    .run();
}

export { deleteEmbeddingsForSource, fetchContent } from './embeddings-source.js';
