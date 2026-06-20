/**
 * Six static TMDB discovery shelves, each a different `/discover/movie` query:
 * new-releases, upcoming-releases, hidden-gems, critics-vs-audiences,
 * award-winners, decade-picks. All profile-scored.
 *
 * Ported from the monolith `shelf/tmdb-shelves.ts` + `tmdb-shelves-helpers.ts`.
 */
import { discoveryService, type PreferenceProfile } from '../../../../db/index.js';
import { topGenreIds } from '../genre-map.js';
import { scoredTmdbShelfQuery } from './shelf-query.js';

import type { DiscoverOpts } from '../../../clients/tmdb/client-mappers.js';
import type { DiscoveryDeps } from '../deps.js';
import type { ShelfDefinition, ShelfGenerateArgs, ShelfInstance } from './types.js';

const ACADEMY_AWARD_KEYWORD_ID = 154712;
const GOLDEN_GLOBE_KEYWORD_ID = 156299;

interface TmdbInstanceArgs {
  shelfId: string;
  title: string;
  subtitle: string;
  emoji: string;
  score: number;
  deps: DiscoveryDeps;
  profile: PreferenceProfile;
  discoverOpts: (page: number) => DiscoverOpts;
}

function buildTmdbInstance(args: TmdbInstanceArgs): ShelfInstance {
  const { shelfId, title, subtitle, emoji, score, deps, profile, discoverOpts } = args;
  return {
    shelfId,
    title,
    subtitle,
    emoji,
    score,
    query: (opts) =>
      scoredTmdbShelfQuery({
        deps,
        profile,
        opts,
        fetch: (page) => deps.tmdbClient.discoverMovies(discoverOpts(page)),
      }),
  };
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const newReleasesShelf: ShelfDefinition = {
  id: 'new-releases',
  template: false,
  category: 'tmdb',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const cutoff = isoDay(-30);
    const genreIds = topGenreIds(profile);
    return [
      buildTmdbInstance({
        shelfId: 'new-releases',
        title: 'New Releases',
        subtitle: 'Fresh titles from the last 30 days',
        emoji: '🆕',
        score: 0.7,
        deps,
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

export const upcomingReleasesShelf: ShelfDefinition = {
  id: 'upcoming-releases',
  template: false,
  category: 'tmdb',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    return [
      buildTmdbInstance({
        shelfId: 'upcoming-releases',
        title: 'Upcoming Releases',
        subtitle: 'Coming to cinemas in the next 90 days',
        emoji: '🎬',
        score: 0.6,
        deps,
        profile,
        discoverOpts: (page) => ({
          releaseDateGte: isoDay(0),
          releaseDateLte: isoDay(90),
          sortBy: 'release_date.asc',
          page,
        }),
      }),
    ];
  },
};

export const hiddenGemsShelf: ShelfDefinition = {
  id: 'hidden-gems',
  template: false,
  category: 'tmdb',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const genreIds = topGenreIds(profile);
    return [
      buildTmdbInstance({
        shelfId: 'hidden-gems',
        title: 'Hidden Gems',
        subtitle: 'Highly rated but undiscovered',
        emoji: '💎',
        score: 0.75,
        deps,
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

export const criticsVsAudiencesShelf: ShelfDefinition = {
  id: 'critics-vs-audiences',
  template: false,
  category: 'tmdb',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    return [
      buildTmdbInstance({
        shelfId: 'critics-vs-audiences',
        title: 'Critics vs Audiences',
        subtitle: 'High ratings, low profile — the overlooked gems',
        emoji: '🎭',
        score: 0.65,
        deps,
        profile,
        discoverOpts: (page) => ({ voteAverageGte: 8.0, sortBy: 'popularity.asc', page }),
      }),
    ];
  },
};

export const awardWinnersShelf: ShelfDefinition = {
  id: 'award-winners',
  template: false,
  category: 'tmdb',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const genreIds = topGenreIds(profile);
    return [
      buildTmdbInstance({
        shelfId: 'award-winners',
        title: 'Award Winners',
        subtitle: 'Academy Award and Golden Globe recognised films',
        emoji: '🏆',
        score: 0.7,
        deps,
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

export const decadePicksShelf: ShelfDefinition = {
  id: 'decade-picks',
  template: false,
  category: 'tmdb',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const decade = discoveryService.getMostWatchedDecade(deps.db);
    return [
      buildTmdbInstance({
        shelfId: 'decade-picks',
        title: `Best of the ${decade}s`,
        subtitle: `Top-rated films from ${decade}–${decade + 9}`,
        emoji: '📅',
        score: 0.65,
        deps,
        profile,
        discoverOpts: (page) => ({
          releaseDateGte: `${decade}-01-01`,
          releaseDateLte: `${decade + 9}-12-31`,
          sortBy: 'vote_average.desc',
          voteCountGte: 100,
          page,
        }),
      }),
    ];
  },
};
