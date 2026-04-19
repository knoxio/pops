/**
 * CrossSourceIndexer — scans non-engram source tables (transactions, movies,
 * tv_shows, home_inventory) and enqueues embedding jobs for rows whose content
 * has changed since the last embedding run.
 *
 * Comparison is by SHA-256 of the embeddable text string against the
 * `content_hash` stored in the `embeddings` table.  Missing rows (never
 * embedded) are always enqueued.
 */
import { and, eq, inArray } from 'drizzle-orm';

import { embeddings, homeInventory, movies, transactions, tvShows } from '@pops/db-types';

import {
  EMBEDDINGS_JOB_OPTIONS,
  EMBEDDINGS_QUEUE,
  getEmbeddingsQueue,
} from '../../../jobs/queues.js';
import { chunkText, hashContent } from '../../../shared/chunker.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export const CROSS_SOURCE_TYPES = ['transaction', 'movie', 'tv_show', 'inventory'] as const;
export type CrossSourceType = (typeof CROSS_SOURCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Row type aliases (inferred from table select shapes)
// ---------------------------------------------------------------------------

type TransactionRow = typeof transactions.$inferSelect;
type MovieRow = typeof movies.$inferSelect;
type TvShowRow = typeof tvShows.$inferSelect;
type InventoryRow = typeof homeInventory.$inferSelect;

// ---------------------------------------------------------------------------
// Embeddable-text formatters
// ---------------------------------------------------------------------------

/** Produce labelled plain text for a transaction row, skipping null/empty fields. */
export function toTransactionText(row: TransactionRow): string {
  const parts: string[] = [];
  if (row.description) parts.push(`Description: ${row.description}`);
  if (row.entityName) parts.push(`Merchant: ${row.entityName}`);
  if (row.tags) parts.push(`Category: ${row.tags}`);
  if (row.notes) parts.push(`Notes: ${row.notes}`);
  return parts.join('\n');
}

/** Produce labelled plain text for a movie row, skipping null/empty fields. */
export function toMovieText(row: MovieRow): string {
  const parts: string[] = [];
  if (row.title) parts.push(`Title: ${row.title}`);
  if (row.overview) parts.push(`Overview: ${row.overview}`);
  if (row.genres) parts.push(`Genres: ${row.genres}`);
  return parts.join('\n');
}

/** Produce labelled plain text for a TV show row, skipping null/empty fields. */
export function toTvShowText(row: TvShowRow): string {
  const parts: string[] = [];
  if (row.name) parts.push(`Title: ${row.name}`);
  if (row.overview) parts.push(`Overview: ${row.overview}`);
  if (row.genres) parts.push(`Genres: ${row.genres}`);
  return parts.join('\n');
}

/** Produce labelled plain text for an inventory row, skipping null/empty fields. */
export function toInventoryText(row: InventoryRow): string {
  const parts: string[] = [];
  if (row.itemName) parts.push(`Name: ${row.itemName}`);
  if (row.brand) parts.push(`Brand: ${row.brand}`);
  if (row.type) parts.push(`Type: ${row.type}`);
  if (row.location) parts.push(`Location: ${row.location}`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// CrossSourceIndexer
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

export class CrossSourceIndexer {
  constructor(private readonly db: BetterSQLite3Database) {}

  /**
   * Scan source tables and enqueue jobs for rows with missing or stale
   * embeddings.  Processes each source type in batches of 100.
   *
   * @param sourceTypes Subset of types to process; defaults to all.
   * @returns Total number of jobs enqueued.
   */
  async scanAndEnqueue(
    sourceTypes: CrossSourceType[] = [...CROSS_SOURCE_TYPES]
  ): Promise<{ enqueued: number }> {
    let enqueued = 0;

    for (const sourceType of sourceTypes) {
      enqueued += await this.processSourceType(sourceType);
    }

    return { enqueued };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async processSourceType(sourceType: CrossSourceType): Promise<number> {
    switch (sourceType) {
      case 'transaction':
        return this.processBatches(
          'transaction',
          () => this.db.select().from(transactions).all(),
          (row) => ({ id: row.id, text: toTransactionText(row) })
        );
      case 'movie':
        return this.processBatches(
          'movie',
          () => this.db.select().from(movies).all(),
          (row) => ({ id: String(row.id), text: toMovieText(row) })
        );
      case 'tv_show':
        return this.processBatches(
          'tv_show',
          () => this.db.select().from(tvShows).all(),
          (row) => ({ id: String(row.id), text: toTvShowText(row) })
        );
      case 'inventory':
        return this.processBatches(
          'inventory',
          () => this.db.select().from(homeInventory).all(),
          (row) => ({ id: row.id, text: toInventoryText(row) })
        );
    }
  }

  private async processBatches<T>(
    sourceType: string,
    fetchAll: () => T[],
    toItem: (row: T) => { id: string; text: string }
  ): Promise<number> {
    const rows = fetchAll();
    let enqueued = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const items = batch.map(toItem);
      const ids = items.map((it) => it.id);

      // Fetch chunk_index=0 embeddings for this batch — compare against the first chunk hash
      // to detect whether content has changed since the last embedding run.
      const existing = this.db
        .select({ sourceId: embeddings.sourceId, contentHash: embeddings.contentHash })
        .from(embeddings)
        .where(
          and(
            eq(embeddings.sourceType, sourceType),
            inArray(embeddings.sourceId, ids),
            eq(embeddings.chunkIndex, 0)
          )
        )
        .all();

      const chunk0HashBySourceId = new Map(existing.map((e) => [e.sourceId, e.contentHash]));

      const queue = getEmbeddingsQueue();

      for (const item of items) {
        if (!item.text.trim()) continue;
        const firstChunk = chunkText(item.text)[0];
        if (!firstChunk) continue;
        const firstChunkHash = hashContent(firstChunk.text);
        const existingHash = chunk0HashBySourceId.get(item.id);
        if (existingHash === firstChunkHash) continue;

        try {
          await queue.add(
            EMBEDDINGS_QUEUE,
            { sourceType, sourceId: item.id, content: item.text },
            EMBEDDINGS_JOB_OPTIONS
          );
          enqueued++;
        } catch (err) {
          console.error(
            `[thalamus] Failed to enqueue embedding for ${sourceType}/${item.id}:`,
            err
          );
        }
      }
    }

    return enqueued;
  }
}
