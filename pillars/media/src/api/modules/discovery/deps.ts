/**
 * Shared dependency bundle for the discovery orchestration layer + the flag-set
 * loader every TMDB-backed path uses.
 *
 * The api layer injects a `{ db, tmdbClient }` bundle so the orchestration is
 * unit-testable (the handler boundary resolves the real client via
 * `getTmdbClient()`). The flag sets (library / watched / watchlist / dismissed
 * TMDB ids) are loaded together so filtering + annotation share one read.
 */
import { type MediaDb, dismissedDiscoverService, discoveryService } from '../../../db/index.js';

import type { TmdbClient } from '../../clients/tmdb/index.js';
import type { FlagSets } from './discover-result-mapper.js';

export interface DiscoveryDeps {
  db: MediaDb;
  tmdbClient: TmdbClient;
}

/** Load the library / watched / watchlist / dismissed TMDB-id sets in one pass. */
export function loadFlagSets(db: MediaDb): FlagSets {
  return {
    libraryIds: discoveryService.getLibraryTmdbIdSet(db),
    watchedIds: discoveryService.getWatchedTmdbIdSet(db),
    watchlistIds: discoveryService.getWatchlistTmdbIdSet(db),
    dismissedIds: dismissedDiscoverService.getDismissedTmdbIdSet(db),
  };
}
