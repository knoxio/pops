/**
 * Discovery / preference profile types.
 */

export interface GenreAffinity {
  genre: string;
  avgScore: number;
  movieCount: number;
  totalComparisons: number;
}

export interface DimensionWeight {
  dimensionId: number;
  name: string;
  comparisonCount: number;
  avgScore: number;
}

export interface GenreDistribution {
  genre: string;
  watchCount: number;
  percentage: number;
}

export interface PreferenceProfile {
  genreAffinities: GenreAffinity[];
  dimensionWeights: DimensionWeight[];
  genreDistribution: GenreDistribution[];
  totalMoviesWatched: number;
  totalComparisons: number;
}
