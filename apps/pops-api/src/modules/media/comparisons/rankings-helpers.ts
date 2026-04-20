/** Resolve the best poster URL from a rankings row. */
export function resolvePosterUrl(row: {
  mediaType: string;
  moviePosterPath: string | null;
  movieTmdbId: number | null;
  moviePosterOverride: string | null;
  tvPosterPath: string | null;
  tvTvdbId: number | null;
  tvPosterOverride: string | null;
}): string | null {
  if (row.mediaType === 'movie') {
    if (row.moviePosterOverride) return row.moviePosterOverride;
    if (row.movieTmdbId) return `/media/images/movie/${row.movieTmdbId}/poster.jpg`;
    return null;
  }
  if (row.tvPosterOverride) return row.tvPosterOverride;
  if (row.tvPosterPath && row.tvTvdbId) return `/media/images/tv/${row.tvTvdbId}/poster.jpg`;
  return null;
}

export interface RankingRowBase {
  mediaType: string;
  mediaId: number;
  score: number;
  comparisonCount: number;
  title: string;
  year: number | null;
  moviePosterPath: string | null;
  movieTmdbId: number | null;
  moviePosterOverride: string | null;
  tvPosterPath: string | null;
  tvTvdbId: number | null;
  tvPosterOverride: string | null;
}
