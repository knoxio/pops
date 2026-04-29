import { registerShelf } from './registry.js';
/**
 * TMDB-powered discovery shelves — 6 static (template=false) shelves
 * that each query TMDB /discover/movie with different filters:
 *
 *  1. new-releases        — Last 30 days, filtered by top genre affinities
 *  2. upcoming-releases   — Next 90 days, sorted by release date ascending
 *  3. hidden-gems         — Vote count 50-500, avg ≥7.0, top genres
 *  4. critics-vs-audiences — High avg (≥8.0) + low popularity (ascending sort)
 *  5. award-winners       — TMDB keyword IDs for academy-award / golden-globe + top genres
 *  6. decade-picks        — Year range of the decade with most watches in watch_history
 */
import {
  ACADEMY_AWARD_KEYWORD_ID,
  buildTmdbInstance,
  GOLDEN_GLOBE_KEYWORD_ID,
  getMostWatchedDecade,
  topGenreIds,
} from './tmdb-shelves-helpers.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

const newReleasesShelf: ShelfDefinition = {
  id: 'new-releases',
  template: false,
  category: 'tmdb',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const genreIds = topGenreIds(profile);
    return [
      buildTmdbInstance({
        shelfId: 'new-releases',
        title: 'New Releases',
        subtitle: 'Fresh titles from the last 30 days',
        emoji: '🆕',
        score: 0.7,
        profile,
        discoverOpts: (page) => ({
          releaseDateGte: cutoff,
          genreIds: genreIds.length > 0 ? genreIds : undefined,
          sortBy: 'popularity.desc',
          page,
        }),
      }),
    ];
  },
};

const upcomingReleasesShelf: ShelfDefinition = {
  id: 'upcoming-releases',
  template: false,
  category: 'tmdb',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return [
      buildTmdbInstance({
        shelfId: 'upcoming-releases',
        title: 'Upcoming Releases',
        subtitle: 'Coming to cinemas in the next 90 days',
        emoji: '🎬',
        score: 0.6,
        profile,
        discoverOpts: (page) => ({
          releaseDateGte: today,
          releaseDateLte: cutoff,
          sortBy: 'release_date.asc',
          page,
        }),
      }),
    ];
  },
};

const hiddenGemsShelf: ShelfDefinition = {
  id: 'hidden-gems',
  template: false,
  category: 'tmdb',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const genreIds = topGenreIds(profile);
    return [
      buildTmdbInstance({
        shelfId: 'hidden-gems',
        title: 'Hidden Gems',
        subtitle: 'Highly rated but undiscovered',
        emoji: '💎',
        score: 0.75,
        profile,
        discoverOpts: (page) => ({
          voteCountGte: 50,
          voteCountLte: 500,
          voteAverageGte: 7.0,
          genreIds: genreIds.length > 0 ? genreIds : undefined,
          sortBy: 'vote_average.desc',
          page,
        }),
      }),
    ];
  },
};

const criticsVsAudiencesShelf: ShelfDefinition = {
  id: 'critics-vs-audiences',
  template: false,
  category: 'tmdb',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    return [
      buildTmdbInstance({
        shelfId: 'critics-vs-audiences',
        title: 'Critics vs Audiences',
        subtitle: 'High ratings, low profile — the overlooked gems',
        emoji: '🎭',
        score: 0.65,
        profile,
        discoverOpts: (page) => ({
          voteAverageGte: 8.0,
          sortBy: 'popularity.asc',
          page,
        }),
      }),
    ];
  },
};

const awardWinnersShelf: ShelfDefinition = {
  id: 'award-winners',
  template: false,
  category: 'tmdb',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const genreIds = topGenreIds(profile);
    return [
      buildTmdbInstance({
        shelfId: 'award-winners',
        title: 'Award Winners',
        subtitle: 'Academy Award and Golden Globe recognised films',
        emoji: '🏆',
        score: 0.7,
        profile,
        discoverOpts: (page) => ({
          keywordIds: [ACADEMY_AWARD_KEYWORD_ID, GOLDEN_GLOBE_KEYWORD_ID],
          genreIds: genreIds.length > 0 ? genreIds : undefined,
          sortBy: 'vote_average.desc',
          page,
        }),
      }),
    ];
  },
};

const decadePicksShelf: ShelfDefinition = {
  id: 'decade-picks',
  template: false,
  category: 'tmdb',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const decade = getMostWatchedDecade();
    const dateGte = `${decade}-01-01`;
    const dateLte = `${decade + 9}-12-31`;
    return [
      buildTmdbInstance({
        shelfId: 'decade-picks',
        title: `Best of the ${decade}s`,
        subtitle: `Top-rated films from ${decade}–${decade + 9}`,
        emoji: '📅',
        score: 0.65,
        profile,
        discoverOpts: (page) => ({
          releaseDateGte: dateGte,
          releaseDateLte: dateLte,
          sortBy: 'vote_average.desc',
          voteCountGte: 100,
          page,
        }),
      }),
    ];
  },
};

registerShelf(newReleasesShelf);
registerShelf(upcomingReleasesShelf);
registerShelf(hiddenGemsShelf);
registerShelf(criticsVsAudiencesShelf);
registerShelf(awardWinnersShelf);
registerShelf(decadePicksShelf);
