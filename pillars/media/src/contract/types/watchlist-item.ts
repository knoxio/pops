export const MEDIA_KINDS = ['movie', 'tv-show'] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * A row on the media watchlist — a movie or TV show the user intends to
 * watch later. Contract wire shape (camelCase) for downstream consumers.
 * The DB-internal row shape lives in `src/db` and is not surfaced through
 * the contract.
 *
 * `mediaType` is constrained to the cross-pillar `MEDIA_KINDS` union; the
 * watchlist is only ever rolled up to the show level, so episodes are not
 * watchlisted.
 */
export interface WatchlistItem {
  id: string;
  mediaType: MediaKind;
  /** Stable id of the watchlisted entity (movie id or TV show id). */
  targetId: string;
  /** ISO-8601 timestamp. Validated by `WatchlistItemSchema` via `.datetime()`. */
  addedAt: string;
  /** ISO-8601 timestamp. Validated by `WatchlistItemSchema` via `.datetime()`. */
  lastEditedTime: string;
}
