export const MEDIA_KINDS = ['movie', 'tv-show'] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * A row on the media watchlist — a movie or TV show the user intends to
 * watch later. Pins the contract wire shape (camelCase) for downstream
 * consumers. DB-internal shape lives in `@pops/media-db` and is not
 * surfaced through the contract.
 *
 * The contract shape deliberately diverges from the live API row served
 * by `apps/pops-api/src/modules/media/watchlist`: that row carries
 * `priority`, `notes`, `source`, `plexRatingKey`, joined `title`, joined
 * `posterUrl`, and uses `mediaId` / `updatedAt` as the pointer/timestamp
 * keys. This contract pins only the identifying pointer renamed for
 * cross-pillar consistency (`mediaType` + `targetId`) plus `addedAt` /
 * `lastEditedTime`. The mapper in `apps/pops-media-api` translates from
 * the row to this shape. Extra row fields the API still emits today are
 * not part of the contract.
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
