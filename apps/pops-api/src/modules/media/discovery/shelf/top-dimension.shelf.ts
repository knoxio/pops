import { and, desc, eq } from 'drizzle-orm';

import { mediaScores, movies } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from '../flags.js';
import { getLibraryTmdbIds } from '../tmdb-service.js';
import { getActiveDimensions } from './genre-shelves-common.js';
import { registerShelf } from './registry.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

interface TopMovieRow {
  movieId: number;
  tmdbId: number;
  title: string;
  score: number;
}

function getTopMoviesForDimension(dimensionId: number, limit: number): TopMovieRow[] {
  const db = getDrizzle();
  return db
    .select({
      movieId: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      score: mediaScores.score,
    })
    .from(mediaScores)
    .innerJoin(movies, and(eq(movies.id, mediaScores.mediaId), eq(mediaScores.mediaType, 'movie')))
    .where(eq(mediaScores.dimensionId, dimensionId))
    .orderBy(desc(mediaScores.score))
    .limit(limit)
    .all();
}

export const topDimensionShelf: ShelfDefinition = {
  id: 'top-dimension',
  template: true,
  category: 'seed',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const dimensions = getActiveDimensions(profile);
    if (dimensions.length === 0) return [];

    return dimensions.map((dim) => ({
      shelfId: `top-dimension:${dim.dimensionId}`,
      title: `Top ${dim.name} picks`,
      subtitle: `Your highest-rated films for ${dim.name}`,
      emoji: '⭐',
      score: Math.min(0.9, 0.5 + dim.avgScore / 3000),
      query: ({ limit, offset }) => {
        const topMovies = getTopMoviesForDimension(dim.dimensionId, limit + offset);
        const sliced = topMovies.slice(offset, offset + limit);
        const libraryIds = getLibraryTmdbIds();
        const watchedIds = getWatchedTmdbIds();
        const watchlistIds = getWatchlistTmdbIds();
        const dismissedIds = getDismissedTmdbIds();

        return Promise.resolve(
          sliced
            .filter((m) => !dismissedIds.has(m.tmdbId))
            .map((m) => ({
              tmdbId: m.tmdbId,
              title: m.title,
              overview: '',
              releaseDate: '',
              posterPath: null,
              posterUrl: libraryIds.has(m.tmdbId)
                ? `/media/images/movie/${m.tmdbId}/poster.jpg`
                : null,
              backdropPath: null,
              voteAverage: 0,
              voteCount: 0,
              genreIds: [],
              popularity: 0,
              inLibrary: libraryIds.has(m.tmdbId),
              isWatched: watchedIds.has(m.tmdbId),
              onWatchlist: watchlistIds.has(m.tmdbId),
            }))
        );
      },
    }));
  },
};

registerShelf(topDimensionShelf);
