import { and, desc, eq } from 'drizzle-orm';

import { comparisonDimensions, mediaScores, movies } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { getTmdbClient } from '../../tmdb/index.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from '../flags.js';
import { scoreDiscoverResults } from '../service.js';
import { getLibraryTmdbIds, toDiscoverResults } from '../tmdb-service.js';
import { getActiveDimensions, MAX_DIMENSION_INSPIRED } from './genre-shelves-common.js';
import { registerShelf } from './registry.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

interface SeedRow {
  movieId: number;
  tmdbId: number;
  title: string;
}

function getHighScoringMovieForDimension(dimensionId: number): SeedRow | null {
  const db = getDrizzle();
  const rows = db
    .select({
      movieId: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
    })
    .from(mediaScores)
    .innerJoin(movies, and(eq(movies.id, mediaScores.mediaId), eq(mediaScores.mediaType, 'movie')))
    .innerJoin(comparisonDimensions, eq(comparisonDimensions.id, mediaScores.dimensionId))
    .where(eq(mediaScores.dimensionId, dimensionId))
    .orderBy(desc(mediaScores.score))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

export const dimensionInspiredShelf: ShelfDefinition = {
  id: 'dimension-inspired',
  template: true,
  category: 'seed',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const dimensions = getActiveDimensions(profile).slice(0, MAX_DIMENSION_INSPIRED);
    if (dimensions.length === 0) return [];

    const instances: ShelfInstance[] = [];
    for (const dim of dimensions) {
      const seed = getHighScoringMovieForDimension(dim.dimensionId);
      if (!seed) continue;
      instances.push({
        shelfId: `dimension-inspired:${seed.movieId}:${dim.dimensionId}`,
        title: `You loved ${seed.title}'s ${dim.name}`,
        subtitle: `Similar films based on ${dim.name}`,
        emoji: '💡',
        score: 0.75,
        seedMovieId: seed.movieId,
        query: async ({ limit, offset }) => {
          const client = getTmdbClient();
          const page = Math.floor(offset / 20) + 1;
          const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
            client.getMovieRecommendations(seed.tmdbId, page),
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
      });
    }
    return instances;
  },
};

registerShelf(dimensionInspiredShelf);
