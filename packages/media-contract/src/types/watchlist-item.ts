export const MEDIA_KINDS = ['movie', 'tv-show'] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * A row on the media watchlist — a movie or TV show the user intends to
 * watch later. Mirrors the API response (camelCase). DB-internal shape
 * lives in `@pops/media-db` and is not surfaced through the contract.
 *
 * The contract shape is narrower than the live API row served by
 * `apps/pops-api/src/modules/media/watchlist`. That row carries
 * `priority`, `notes`, `source`, `plexRatingKey`, joined `title`, and
 * joined `posterUrl`; this contract pins only the identifying pointer
 * (`mediaType` + `targetId`) plus timestamps. Extra fields the API still
 * emits today are not part of the contract.
 *
 * `mediaType` is constrained to the cross-pillar `MEDIA_KINDS` union
 * (`'movie' | 'tv-show'`). The legacy API row uses `'episode'` as a
 * watch-history media type, but the watchlist is only ever rolled up to
 * the show level; episodes are not watchlisted.
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
