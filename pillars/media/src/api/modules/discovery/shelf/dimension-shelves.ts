/**
 * "Top {Dimension} picks" (local) + "You loved {Movie}'s {Dimension}" (TMDB)
 * shelves, both seeded from the user's most-engaged comparison dimensions.
 *
 * Ported from the monolith `shelf/top-dimension.shelf.ts` +
 * `dimension-inspired.shelf.ts` (+ `getActiveDimensions`).
 */
import { discoveryService, type PreferenceProfile } from '../../../../db/index.js';
import { loadFlagSets } from '../deps.js';
import { scoredTmdbShelfQuery } from './shelf-query.js';

import type { DiscoverResult } from '../../../../db/index.js';
import type { ShelfDefinition, ShelfGenerateArgs, ShelfInstance } from './types.js';

const MIN_DIMENSION_COMPARISONS = 5;
const MAX_TOP_DIMENSION = 5;
const MAX_DIMENSION_INSPIRED = 3;

interface DimensionSeed {
  dimensionId: number;
  name: string;
  avgScore: number;
}

/** Dimensions with enough engagement, most-compared first, capped. */
function getActiveDimensions(profile: PreferenceProfile): DimensionSeed[] {
  return profile.dimensionWeights
    .filter((d) => d.comparisonCount >= MIN_DIMENSION_COMPARISONS)
    .toSorted((a, b) => b.comparisonCount - a.comparisonCount)
    .slice(0, MAX_TOP_DIMENSION)
    .map((d) => ({ dimensionId: d.dimensionId, name: d.name, avgScore: d.avgScore }));
}

export const topDimensionShelf: ShelfDefinition = {
  id: 'top-dimension',
  template: true,
  category: 'seed',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    return getActiveDimensions(profile).map((dim) => ({
      shelfId: `top-dimension:${dim.dimensionId}`,
      title: `Top ${dim.name} picks`,
      subtitle: `Your highest-rated films for ${dim.name}`,
      emoji: '⭐',
      score: Math.min(0.9, 0.5 + dim.avgScore / 3000),
      query: (opts) => {
        const top = discoveryService.getTopMoviesForDimension(
          deps.db,
          dim.dimensionId,
          opts.limit + opts.offset
        );
        const sliced = top.slice(opts.offset, opts.offset + opts.limit);
        const flags = loadFlagSets(deps.db);
        const results: DiscoverResult[] = sliced
          .filter((m) => !flags.dismissedIds.has(m.tmdbId))
          .map((m) => ({
            tmdbId: m.tmdbId,
            title: m.title,
            overview: '',
            releaseDate: '',
            posterPath: null,
            posterUrl: flags.libraryIds.has(m.tmdbId)
              ? `/media/images/movie/${m.tmdbId}/poster.jpg`
              : null,
            backdropPath: null,
            voteAverage: 0,
            voteCount: 0,
            genreIds: [],
            popularity: 0,
            inLibrary: flags.libraryIds.has(m.tmdbId),
            isWatched: flags.watchedIds.has(m.tmdbId),
            onWatchlist: flags.watchlistIds.has(m.tmdbId),
          }));
        return Promise.resolve(results);
      },
    }));
  },
};

export const dimensionInspiredShelf: ShelfDefinition = {
  id: 'dimension-inspired',
  template: true,
  category: 'seed',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const dimensions = getActiveDimensions(profile).slice(0, MAX_DIMENSION_INSPIRED);
    const instances: ShelfInstance[] = [];
    for (const dim of dimensions) {
      const seed = discoveryService.getHighScoringMovieForDimension(deps.db, dim.dimensionId);
      if (!seed) continue;
      instances.push({
        shelfId: `dimension-inspired:${seed.movieId}:${dim.dimensionId}`,
        title: `You loved ${seed.title}'s ${dim.name}`,
        subtitle: `Similar films based on ${dim.name}`,
        emoji: '💡',
        score: 0.75,
        seedMovieId: seed.movieId,
        query: (opts) =>
          scoredTmdbShelfQuery({
            deps,
            profile,
            opts,
            fetch: (page) => deps.tmdbClient.getMovieRecommendations(seed.tmdbId, page),
          }),
      });
    }
    return instances;
  },
};
