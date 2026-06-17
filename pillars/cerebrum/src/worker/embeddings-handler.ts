/**
 * Embeddings generation handler for the cerebrum worker.
 *
 * Consumes `pops-embeddings` jobs `{ sourceType, sourceId, content? }` and
 * writes the dense-vector index for that source into the pillar's own
 * `cerebrum.db` (`embeddings` metadata + `embeddings_vec` vectors). Lifted from
 * the monolith `jobs/handlers/embeddings*.ts`, with content resolution
 * (`./embeddings-content.ts`) extended beyond transactions to every source type
 * the pillar's `thalamus/cross-source.ts` enqueues (engram + transaction /
 * movie / tv_show / inventory).
 *
 * Dedup is by SHA-256 content hash per chunk: an unchanged chunk is skipped.
 * Orphaned chunks (index beyond the new chunk count) are pruned. The vector
 * lands in `embeddings_vec` keyed by the metadata row's id — bound as `BigInt`
 * because sqlite-vec's `rowid` insert rejects a plain JS number.
 *
 * Deviation from the monolith: the `ai_usage` write (shared pops.db) is a no-op
 * here — the pillar has no shared handle and no usage table, and usage tracking
 * is not load-bearing for the index. See {@link EmbedJobResult.tokensUsed}.
 */
import { and, eq, gt } from 'drizzle-orm';

import { chunkText, hashContent, type TextChunk } from '../api/modules/thalamus/chunker.js';
import { type CerebrumDb, embeddings } from '../db/index.js';
import { resolveContent } from './embeddings-content.js';

import type { Database } from 'better-sqlite3';

import type { PeerClients } from '../api/modules/retrieval/peer-clients.js';
import type { TemplateRegistry } from '../api/modules/templates/registry.js';
import type { EmbeddingPort } from './embedding-client.js';

const CONTENT_PREVIEW_LENGTH = 200;

export interface EmbeddingsJobData {
  sourceType: string;
  sourceId: string;
  content?: string;
}

export interface EmbeddingsHandlerDeps {
  db: CerebrumDb;
  raw: Database;
  vecAvailable: boolean;
  engramRoot: string;
  templates: TemplateRegistry;
  peers: PeerClients;
  embedder: EmbeddingPort;
}

export interface EmbedJobResult {
  chunksProcessed: number;
  chunksSkipped: number;
  chunksDeleted: number;
  /** Always 0 — usage tracking is a no-op in the pillar (no shared pops.db). */
  tokensUsed: number;
}

/**
 * Process one embedding job. Resolves content (from the job payload or the
 * source), chunks + embeds the changed chunks, persists vectors, and prunes
 * orphans. Returns counts; never throws on an unavailable source (skips).
 */
export async function processEmbeddingJob(
  deps: EmbeddingsHandlerDeps,
  job: EmbeddingsJobData
): Promise<EmbedJobResult> {
  if (!deps.vecAvailable) {
    throw new Error('sqlite-vec extension not available — cannot store vectors');
  }

  const { sourceType, sourceId } = job;
  const text = job.content ?? (await resolveContent(deps, sourceType, sourceId));
  if (text === null || !text.trim()) {
    const chunksDeleted = deleteEmbeddingsForSource(deps, sourceType, sourceId);
    return { chunksProcessed: 0, chunksSkipped: 0, chunksDeleted, tokensUsed: 0 };
  }

  const chunks = chunkText(text);
  let chunksProcessed = 0;
  let chunksSkipped = 0;

  for (const chunk of chunks) {
    const processed = await processChunk(deps, sourceType, sourceId, chunk);
    if (processed) chunksProcessed++;
    else chunksSkipped++;
  }

  const chunksDeleted = pruneOrphanChunks(deps, sourceType, sourceId, chunks.length);
  return { chunksProcessed, chunksSkipped, chunksDeleted, tokensUsed: 0 };
}

interface ExistingEmbedding {
  id: number;
  contentHash: string;
}

function loadExisting(
  deps: EmbeddingsHandlerDeps,
  sourceType: string,
  sourceId: string,
  chunkIndex: number
): ExistingEmbedding | undefined {
  return deps.db
    .select({ id: embeddings.id, contentHash: embeddings.contentHash })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.sourceType, sourceType),
        eq(embeddings.sourceId, sourceId),
        eq(embeddings.chunkIndex, chunkIndex)
      )
    )
    .get();
}

async function processChunk(
  deps: EmbeddingsHandlerDeps,
  sourceType: string,
  sourceId: string,
  chunk: TextChunk
): Promise<boolean> {
  const contentHash = hashContent(chunk.text);
  const existing = loadExisting(deps, sourceType, sourceId, chunk.index);
  if (existing?.contentHash === contentHash) return false;

  const vector = await deps.embedder.embedDocument(chunk.text);
  upsertChunkEmbedding(deps, {
    sourceType,
    sourceId,
    chunk,
    contentHash,
    contentPreview: chunk.text.slice(0, CONTENT_PREVIEW_LENGTH),
    vector,
    existing,
  });
  return true;
}

interface UpsertArgs {
  sourceType: string;
  sourceId: string;
  chunk: TextChunk;
  contentHash: string;
  contentPreview: string;
  vector: number[];
  existing: ExistingEmbedding | undefined;
}

function persistVector(raw: Database, rowId: number, vector: number[]): void {
  const blob = Buffer.from(new Float32Array(vector).buffer);
  raw.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(BigInt(rowId));
  raw.prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)').run(BigInt(rowId), blob);
}

function upsertChunkEmbedding(deps: EmbeddingsHandlerDeps, args: UpsertArgs): void {
  const now = new Date().toISOString();
  const { model, dimensions } = deps.embedder;

  if (args.existing) {
    deps.db
      .update(embeddings)
      .set({
        contentHash: args.contentHash,
        contentPreview: args.contentPreview,
        model,
        dimensions,
        createdAt: now,
      })
      .where(eq(embeddings.id, args.existing.id))
      .run();
    persistVector(deps.raw, args.existing.id, args.vector);
    return;
  }

  const result = deps.db
    .insert(embeddings)
    .values({
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      chunkIndex: args.chunk.index,
      contentHash: args.contentHash,
      contentPreview: args.contentPreview,
      model,
      dimensions,
      createdAt: now,
    })
    .returning({ id: embeddings.id })
    .get();
  persistVector(deps.raw, result.id, args.vector);
}

function pruneOrphanChunks(
  deps: EmbeddingsHandlerDeps,
  sourceType: string,
  sourceId: string,
  validChunkCount: number
): number {
  const predicate = and(
    eq(embeddings.sourceType, sourceType),
    eq(embeddings.sourceId, sourceId),
    gt(embeddings.chunkIndex, validChunkCount - 1)
  );

  const orphans = deps.db.select({ id: embeddings.id }).from(embeddings).where(predicate).all();
  for (const orphan of orphans) {
    deps.raw.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(BigInt(orphan.id));
  }
  return deps.db.delete(embeddings).where(predicate).run().changes;
}

function deleteEmbeddingsForSource(
  deps: EmbeddingsHandlerDeps,
  sourceType: string,
  sourceId: string
): number {
  const predicate = and(eq(embeddings.sourceType, sourceType), eq(embeddings.sourceId, sourceId));
  const rows = deps.db.select({ id: embeddings.id }).from(embeddings).where(predicate).all();
  for (const row of rows) {
    deps.raw.prepare('DELETE FROM embeddings_vec WHERE rowid = ?').run(BigInt(row.id));
  }
  return deps.db.delete(embeddings).where(predicate).run().changes;
}
