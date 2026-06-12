import type { MediaKind } from './watchlist-item.js';

/**
 * A single watch event — a record that the user watched a movie or TV
 * show (rolled up to the show level) at a specific moment. Mirrors the
 * API response (camelCase). DB-internal shape lives in `@pops/media-db`
 * and is not surfaced through the contract.
 *
 * The contract shape is narrower than the live API row served by
 * `apps/pops-api/src/modules/media/watch-history`. That row carries an
 * integer `completed` flag (0/1) and uses `'episode'` as a media type;
 * this contract instead exposes a `progressPercent` in [0, 100] (or
 * `null` when unknown) and constrains `mediaType` to the cross-pillar
 * `MediaKind` union (`'movie' | 'tv-show'`).
 */
export interface WatchEvent {
  id: string;
  mediaType: MediaKind;
  /** Stable id of the watched entity (movie id or TV show id). */
  targetId: string;
  /** ISO-8601 timestamp. Validated by `WatchEventSchema` via `.datetime()`. */
  watchedAt: string;
  /** Progress through the runtime, in [0, 100]. `null` when not tracked. */
  progressPercent: number | null;
  /** ISO-8601 timestamp. Validated by `WatchEventSchema` via `.datetime()`. */
  lastEditedTime: string;
}
