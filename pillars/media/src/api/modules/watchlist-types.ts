/**
 * Watchlist wire-shape mapper for the media pillar REST surface.
 *
 * `title`/`posterUrl` are enrichment fields joined from `movies` / `tv_shows`;
 * they are currently served as `null` (no enrichment in the read path).
 */
import type { MediaWatchlistRow } from '../../db/index.js';

export type { MediaWatchlistRow };

export const MEDIA_TYPES = ['movie', 'tv_show'] as const;

export interface WatchlistEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  priority: number | null;
  notes: string | null;
  source: string | null;
  plexRatingKey: string | null;
  addedAt: string;
  title: string | null;
  posterUrl: string | null;
}

export function toWatchlistEntry(
  row: MediaWatchlistRow & { title?: string | null; posterUrl?: string | null }
): WatchlistEntry {
  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaId: row.mediaId,
    priority: row.priority,
    notes: row.notes,
    source: row.source,
    plexRatingKey: row.plexRatingKey,
    addedAt: row.addedAt,
    title: row.title ?? null,
    posterUrl: row.posterUrl ?? null,
  };
}
