/**
 * Read-only query helpers for the `cerebrum.embeddings.*` surface (PRD-249).
 *
 * Thin wrappers over the `embeddings` metadata table bound to a drizzle
 * handle. `getStatus` reports the embedded-row count (optionally scoped to a
 * source type); `pending` / `stale` are held at `0` — per-source coverage
 * tracking is out of scope for the current surface.
 */
import { eq, sql } from 'drizzle-orm';

import { type CerebrumDb, embeddings } from '../../../db/index.js';

import type { EmbeddingsStatusWire } from '../../../contract/rest-embeddings.js';

export interface EmbeddingsReadService {
  getStatus: (sourceType?: string) => EmbeddingsStatusWire;
  listSourceIdsByType: (sourceType: string) => string[];
}

export function createEmbeddingsReadService(db: CerebrumDb): EmbeddingsReadService {
  return {
    getStatus: (sourceType?: string): EmbeddingsStatusWire => {
      const baseQuery = db.select({ count: sql<number>`count(*)` }).from(embeddings);
      const rows = sourceType
        ? baseQuery.where(eq(embeddings.sourceType, sourceType)).all()
        : baseQuery.all();
      const total = rows[0]?.count ?? 0;
      return { total, pending: 0, stale: 0 };
    },

    listSourceIdsByType: (sourceType: string): string[] => {
      const rows = db
        .selectDistinct({ sourceId: embeddings.sourceId })
        .from(embeddings)
        .where(eq(embeddings.sourceType, sourceType))
        .all();
      return rows.map((row) => row.sourceId);
    },
  };
}
