import type { MediaKind } from './watchlist-item.js';

/**
 * A single watch event — a record that the user watched a movie or TV
 * show (rolled up to the show level) at a specific moment. Contract wire
 * shape (camelCase) for downstream consumers. The DB-internal row shape
 * lives in `src/db` and is not surfaced through the contract.
 *
 * `mediaType` is constrained to the cross-pillar `MediaKind` union;
 * watch events are rolled up to the show level, so there is no `'episode'`
 * kind.
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
