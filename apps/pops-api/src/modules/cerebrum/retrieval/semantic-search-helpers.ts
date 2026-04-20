import { getDb } from '../../../db.js';

import type { RetrievalFilters, RetrievalResult } from './types.js';

export interface VectorRow {
  source_type: string;
  source_id: string;
  chunk_index: number;
  content_preview: string;
  content_hash: string;
  distance: number;
}

/** Run a single k-NN query against embeddings_vec. */
export function knnQuery(vectorBlob: Float32Array, fetchLimit: number): VectorRow[] {
  const rawDb = getDb();
  return rawDb
    .prepare(
      `
      SELECT
        e.source_type,
        e.source_id,
        e.chunk_index,
        e.content_preview,
        e.content_hash,
        ev.distance
      FROM embeddings_vec ev
      JOIN embeddings e ON e.id = ev.rowid
      WHERE ev.vector MATCH ?
        AND ev.k = ?
      ORDER BY ev.distance
    `
    )
    .all(vectorBlob, fetchLimit) as VectorRow[];
}

/** Deduplicate by sourceId — keep the closest chunk per source. */
export function dedupeBySource(rows: VectorRow[]): Map<string, VectorRow> {
  const seen = new Map<string, VectorRow>();
  for (const row of rows) {
    const key = `${row.source_type}:${row.source_id}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return seen;
}

export interface ResolvedMetadata {
  title: string;
  fields: Record<string, unknown>;
}

export function makeRetrievalResult(row: VectorRow, metadata: ResolvedMetadata): RetrievalResult {
  return {
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: metadata.title,
    contentPreview: row.content_preview.slice(0, 200),
    score: Math.max(0, 1 - row.distance),
    distance: row.distance,
    matchType: 'semantic',
    metadata: {
      ...metadata.fields,
      contentHash: row.content_hash,
    },
  };
}

export interface CollectArgs {
  rows: Iterable<VectorRow>;
  filters: RetrievalFilters;
  limit: number;
  resolveMetadata: (
    sourceType: string,
    sourceId: string,
    filters: RetrievalFilters
  ) => Promise<ResolvedMetadata | null>;
}

export async function collectResults(args: CollectArgs): Promise<RetrievalResult[]> {
  const results: RetrievalResult[] = [];
  for (const row of args.rows) {
    if (args.filters.sourceTypes && !args.filters.sourceTypes.includes(row.source_type)) continue;
    const metadata = await args.resolveMetadata(row.source_type, row.source_id, args.filters);
    if (!metadata) continue;
    results.push(makeRetrievalResult(row, metadata));
    if (results.length >= args.limit) break;
  }
  return results;
}

export function vecUnavailableError(): Error {
  return Object.assign(new Error('Vector features unavailable: sqlite-vec extension not loaded'), {
    code: 'VEC_UNAVAILABLE',
  });
}

export function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

export function crossSourceTitle(sourceType: string, row: Record<string, unknown>): string {
  switch (sourceType) {
    case 'transaction':
      return (row['description'] as string | undefined) ?? 'Transaction';
    case 'movie':
      return (row['title'] as string | undefined) ?? 'Movie';
    case 'tv_show':
      return (row['name'] as string | undefined) ?? 'TV Show';
    case 'inventory':
      return (row['itemName'] as string | undefined) ?? 'Inventory item';
    default:
      return sourceType;
  }
}
