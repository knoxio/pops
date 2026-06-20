/**
 * Watch-history wire-shape mappers for the media pillar REST surface.
 *
 * `toWatchHistoryEntry` is the verbatim passthrough from the legacy
 * `media.watch-history` tRPC router (id, mediaType, mediaId, watchedAt,
 * completed). The enriched / progress wire shapes are owned by the db service
 * layer (the computation lives there) and re-exported here as the API surface
 * types so the handlers and contract stay aligned.
 */
import type {
  BatchLogResult,
  BatchProgressEntry,
  RecentWatchHistoryEntry,
  TvShowProgress,
  WatchHistoryRow,
} from '../../db/index.js';

export type {
  BatchLogResult,
  BatchProgressEntry,
  RecentWatchHistoryEntry,
  TvShowProgress,
  WatchHistoryRow,
};

/** API response shape for a watch history entry. */
export interface WatchHistoryEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  watchedAt: string;
  completed: number;
}

/** Map a SQLite row to the API response shape (verbatim passthrough). */
export function toWatchHistoryEntry(row: WatchHistoryRow): WatchHistoryEntry {
  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaId: row.mediaId,
    watchedAt: row.watchedAt,
    completed: row.completed,
  };
}
