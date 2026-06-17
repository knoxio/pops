/**
 * Static shelf registry — the deterministic set of all shelf definitions.
 *
 * Unlike the monolith (module-load-time `registerShelf` side-effects into a
 * mutable global), the pillar assembles the registry as a frozen array imported
 * explicitly here. Deterministic, test-friendly, no double-registration risk.
 *
 * The Plex-Discover-backed `trending-plex` shelf is intentionally absent
 * (Plex Discover client not ported — wave-3 follow-up).
 */
import { becauseYouWatchedShelf } from './because-you-watched.js';
import { contextShelfDefinition } from './context-shelf.js';
import { moreFromActorShelf, moreFromDirectorShelf } from './credits.js';
import { dimensionInspiredShelf, topDimensionShelf } from './dimension-shelves.js';
import {
  fromYourServerShelf,
  fromYourWatchlistShelf,
  recommendationsShelf,
  trendingTmdbShelf,
  worthRewatchingShelf,
} from './existing-shelves.js';
import { bestInGenreShelf, genreCrossoverShelf } from './genre-shelves.js';
import {
  comfortPicksShelf,
  franchiseCompletionsShelf,
  friendProofShelf,
  leavingSoonShelf,
  longEpicShelf,
  polarizingShelf,
  recentlyAddedShelf,
  shortWatchShelf,
  undiscoveredShelf,
} from './local-shelves.js';
import {
  awardWinnersShelf,
  criticsVsAudiencesShelf,
  decadePicksShelf,
  hiddenGemsShelf,
  newReleasesShelf,
  upcomingReleasesShelf,
} from './tmdb-shelves.js';

import type { ShelfDefinition } from './types.js';

const SHELF_DEFINITIONS: readonly ShelfDefinition[] = Object.freeze([
  becauseYouWatchedShelf,
  moreFromDirectorShelf,
  moreFromActorShelf,
  topDimensionShelf,
  dimensionInspiredShelf,
  bestInGenreShelf,
  genreCrossoverShelf,
  contextShelfDefinition,
  newReleasesShelf,
  upcomingReleasesShelf,
  hiddenGemsShelf,
  criticsVsAudiencesShelf,
  awardWinnersShelf,
  decadePicksShelf,
  trendingTmdbShelf,
  recommendationsShelf,
  fromYourWatchlistShelf,
  worthRewatchingShelf,
  fromYourServerShelf,
  comfortPicksShelf,
  undiscoveredShelf,
  recentlyAddedShelf,
  shortWatchShelf,
  longEpicShelf,
  friendProofShelf,
  polarizingShelf,
  franchiseCompletionsShelf,
  leavingSoonShelf,
]);

/** All registered shelf definitions. */
export function getRegisteredShelves(): readonly ShelfDefinition[] {
  return SHELF_DEFINITIONS;
}
