/**
 * CrossSourceIndexer — scans non-engram source rows (transactions, movies,
 * tv_shows, inventory items) and enqueues embedding jobs for rows whose content
 * has changed since the last embedding run.
 *
 * The source rows no longer live in the cerebrum SQLite file; they are paged in
 * over REST from the owning pillar via the injected {@link PeerClients} (the
 * same clients that back retrieval enrichment, extended with paginated LIST
 * methods). A peer absent from `POPS_PILLARS` yields an `undefined` client; that
 * source type is skipped (no crash, contributes 0 to `enqueued`).
 *
 * Change detection is by SHA-256 of the first chunk of the embeddable text
 * compared against the `content_hash` of the `chunk_index = 0` row in the
 * cerebrum `embeddings` table. Rows never embedded are always enqueued.
 */
import { and, eq, inArray } from 'drizzle-orm';

import { type CerebrumDb, embeddings } from '../../../db/index.js';
import { chunkText, hashContent } from './chunker.js';
import { EMBEDDINGS_JOB_OPTIONS, type EmbeddingsQueueAccessor } from './queue.js';

import type {
  FinanceTransactionListRow,
  InventoryItemListRow,
  MediaMovieListRow,
  MediaTvShowListRow,
  PeerClients,
  PeerPage,
} from '../retrieval/peer-clients.js';

export const CROSS_SOURCE_TYPES = ['transaction', 'movie', 'tv_show', 'inventory'] as const;
export type CrossSourceType = (typeof CROSS_SOURCE_TYPES)[number];

export function toTransactionText(row: FinanceTransactionListRow): string {
  const parts: string[] = [];
  if (row.description) parts.push(`Description: ${row.description}`);
  if (row.entityName) parts.push(`Merchant: ${row.entityName}`);
  if (row.tags && row.tags.length > 0) parts.push(`Category: ${row.tags.join(', ')}`);
  if (row.notes) parts.push(`Notes: ${row.notes}`);
  return parts.join('\n');
}

export function toMovieText(row: MediaMovieListRow): string {
  const parts: string[] = [];
  if (row.title) parts.push(`Title: ${row.title}`);
  if (row.overview) parts.push(`Overview: ${row.overview}`);
  if (row.genres && row.genres.length > 0) parts.push(`Genres: ${row.genres.join(', ')}`);
  return parts.join('\n');
}

export function toTvShowText(row: MediaTvShowListRow): string {
  const parts: string[] = [];
  if (row.name) parts.push(`Title: ${row.name}`);
  if (row.overview) parts.push(`Overview: ${row.overview}`);
  if (row.genres && row.genres.length > 0) parts.push(`Genres: ${row.genres.join(', ')}`);
  return parts.join('\n');
}

export function toInventoryText(row: InventoryItemListRow): string {
  const parts: string[] = [];
  if (row.itemName) parts.push(`Name: ${row.itemName}`);
  if (row.brand) parts.push(`Brand: ${row.brand}`);
  if (row.type) parts.push(`Type: ${row.type}`);
  if (row.location) parts.push(`Location: ${row.location}`);
  return parts.join('\n');
}

const PAGE_SIZE = 100;

interface ScanItem {
  id: string;
  text: string;
}

export interface CrossSourceIndexerDeps {
  db: CerebrumDb;
  peers: PeerClients;
  queueAccessor: EmbeddingsQueueAccessor;
}

export class CrossSourceIndexer {
  constructor(private readonly deps: CrossSourceIndexerDeps) {}

  /**
   * Scan the requested source types and enqueue embedding jobs for rows with
   * missing or stale embeddings.
   *
   * @returns Total jobs enqueued. `0` for any type whose peer is absent or
   *   whose queue producer is null (no Redis).
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

  private processSourceType(sourceType: CrossSourceType): Promise<number> {
    switch (sourceType) {
      case 'transaction':
        return this.scanPeer('transaction', (limit, offset) =>
          mapPage(this.deps.peers.finance?.listTransactions(limit, offset), (row) => ({
            id: row.id,
            text: toTransactionText(row),
          }))
        );
      case 'movie':
        return this.scanPeer('movie', (limit, offset) =>
          mapPage(this.deps.peers.media?.listMovies(limit, offset), (row) => ({
            id: String(row.id),
            text: toMovieText(row),
          }))
        );
      case 'tv_show':
        return this.scanPeer('tv_show', (limit, offset) =>
          mapPage(this.deps.peers.media?.listTvShows(limit, offset), (row) => ({
            id: String(row.id),
            text: toTvShowText(row),
          }))
        );
      case 'inventory':
        return this.scanPeer('inventory', (limit, offset) =>
          mapPage(this.deps.peers.inventory?.listItems(limit, offset), (row) => ({
            id: row.id,
            text: toInventoryText(row),
          }))
        );
    }
  }

  private async scanPeer(
    sourceType: string,
    fetchPage: (limit: number, offset: number) => Promise<PeerPage<ScanItem> | null>
  ): Promise<number> {
    let enqueued = 0;
    let offset = 0;

    for (;;) {
      const page = await fetchPage(PAGE_SIZE, offset);
      if (page === null) return 0;
      if (page.rows.length > 0) {
        enqueued += await this.enqueueChanged(sourceType, page.rows);
      }
      if (!page.hasMore || page.rows.length === 0) break;
      offset += page.rows.length;
    }

    return enqueued;
  }

  private async enqueueChanged(sourceType: string, items: ScanItem[]): Promise<number> {
    const queue = this.deps.queueAccessor();
    if (!queue) return 0;

    const ids = items.map((it) => it.id);
    const existing = this.deps.db
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

    let enqueued = 0;
    for (const item of items) {
      if (!item.text.trim()) continue;
      const firstChunk = chunkText(item.text)[0];
      if (!firstChunk) continue;
      if (chunk0HashBySourceId.get(item.id) === hashContent(firstChunk.text)) continue;

      try {
        await queue.add(
          'embed',
          { sourceType, sourceId: item.id, content: item.text },
          EMBEDDINGS_JOB_OPTIONS
        );
        enqueued++;
      } catch (err) {
        console.error(`[thalamus] Failed to enqueue embedding for ${sourceType}/${item.id}:`, err);
      }
    }
    return enqueued;
  }
}

async function mapPage<T>(
  pagePromise: Promise<PeerPage<T>> | undefined,
  toItem: (row: T) => ScanItem
): Promise<PeerPage<ScanItem> | null> {
  if (pagePromise === undefined) return null;
  const page = await pagePromise;
  return { rows: page.rows.map(toItem), hasMore: page.hasMore };
}
