/**
 * Public entity types for the media pillar. Hand-maintained — adding
 * a new entity means adding both a file under `types/` and a matching
 * schema under `schemas/`. The round-trip test enforces that they agree.
 */
export type { Movie } from './movie.js';
export type { TvShow } from './tv-show.js';
export type { WatchlistItem, MediaKind } from './watchlist-item.js';
export { MEDIA_KINDS } from './watchlist-item.js';
export type { WatchEvent } from './watch-event.js';
