import { getTmdbClient } from '../../tmdb/index.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from '../flags.js';
import { scoreDiscoverResults } from '../service.js';
import { getLibraryTmdbIds, toDiscoverResults } from '../tmdb-service.js';
import { GENRE_NAME_TO_ID, getMaxCrossoverPairs, isRelatedPair } from './genre-shelves-common.js';
import { registerShelf } from './registry.js';

import type { GenreAffinity, PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

function pickCrossoverPairs(topGenres: GenreAffinity[]): Array<[GenreAffinity, GenreAffinity]> {
  const pairs: Array<[GenreAffinity, GenreAffinity]> = [];
  for (let i = 0; i < topGenres.length && pairs.length < getMaxCrossoverPairs(); i++) {
    for (let j = i + 1; j < topGenres.length && pairs.length < getMaxCrossoverPairs(); j++) {
      const g1 = topGenres[i];
      const g2 = topGenres[j];
      if (!g1 || !g2) continue;
      if (!isRelatedPair(g1.genre, g2.genre)) {
        pairs.push([g1, g2]);
      }
    }
  }
  return pairs;
}

export const genreCrossoverShelf: ShelfDefinition = {
  id: 'genre-crossover',
  template: true,
  category: 'seed',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const topGenres = profile.genreAffinities
      .slice()
      .toSorted((a, b) => b.avgScore - a.avgScore)
      .slice(0, 6)
      .filter((a) => GENRE_NAME_TO_ID.has(a.genre));

    if (topGenres.length < 2) return [];
    const pairs = pickCrossoverPairs(topGenres);

    return pairs.map(([g1, g2]) => {
      const id1 = GENRE_NAME_TO_ID.get(g1.genre) ?? 0;
      const id2 = GENRE_NAME_TO_ID.get(g2.genre) ?? 0;
      const score = ((g1.avgScore + g2.avgScore) / 2 / 10) * 0.7 + 0.1;
      return {
        shelfId: `genre-crossover:${g1.genre.toLowerCase().replaceAll(/\s+/g, '-')}-${g2.genre.toLowerCase().replaceAll(/\s+/g, '-')}`,
        title: `${g1.genre} × ${g2.genre}`,
        subtitle: `Films that blend ${g1.genre} and ${g2.genre}`,
        emoji: '🔀',
        score: Math.min(0.9, score),
        query: async ({ limit, offset }) => {
          const client = getTmdbClient();
          const page = Math.floor(offset / 20) + 1;
          const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
            client.discoverMovies({ genreIds: [id1, id2], voteCountGte: 20, page }),
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

registerShelf(genreCrossoverShelf);
