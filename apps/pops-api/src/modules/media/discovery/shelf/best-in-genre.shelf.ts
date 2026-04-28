import { getTmdbClient } from '../../tmdb/index.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from '../flags.js';
import { scoreDiscoverResults } from '../service.js';
import { getLibraryTmdbIds, toDiscoverResults } from '../tmdb-service.js';
import { GENRE_NAME_TO_ID, getMaxBestInGenre, normalizeScore } from './genre-shelves-common.js';
import { registerShelf } from './registry.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

export const bestInGenreShelf: ShelfDefinition = {
  id: 'best-in-genre',
  template: true,
  category: 'seed',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const topGenres = profile.genreAffinities
      .slice()
      .toSorted((a, b) => b.avgScore - a.avgScore)
      .slice(0, getMaxBestInGenre())
      .filter((a) => GENRE_NAME_TO_ID.has(a.genre));

    if (topGenres.length === 0) return [];

    const scores = topGenres.map((a) => a.avgScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    return topGenres.map((affinity) => {
      const genreId = GENRE_NAME_TO_ID.get(affinity.genre) ?? 0;
      const score = normalizeScore(affinity.avgScore, minScore, maxScore) * 0.8 + 0.1;
      return {
        shelfId: `best-in-genre:${affinity.genre.toLowerCase().replaceAll(/\s+/g, '-')}`,
        title: `Best in ${affinity.genre}`,
        subtitle: `Top-rated ${affinity.genre} films`,
        emoji: '🎯',
        score,
        query: async ({ limit, offset }) => {
          const client = getTmdbClient();
          const page = Math.floor(offset / 20) + 1;
          const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
            client.discoverMovies({
              genreIds: [genreId],
              sortBy: 'vote_average.desc',
              voteCountGte: 50,
              page,
            }),
            Promise.resolve(getLibraryTmdbIds()),
            Promise.resolve(getWatchedTmdbIds()),
            Promise.resolve(getWatchlistTmdbIds()),
            Promise.resolve(getDismissedTmdbIds()),
          ]);
          const raw = toDiscoverResults(
            response.results,
            libraryIds,
            watchedIds,
            watchlistIds
          ).filter((r) => !dismissedIds.has(r.tmdbId));
          const scored = scoreDiscoverResults(raw, profile);
          scored.sort((a, b) => b.matchPercentage - a.matchPercentage);
          const start = offset % 20;
          return scored.slice(start, start + limit);
        },
      };
    });
  },
};

registerShelf(bestInGenreShelf);
