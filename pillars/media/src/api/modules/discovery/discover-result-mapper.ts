/**
 * Mapping helpers from TMDB search results to {@link DiscoverResult}, plus the
 * shared poster-url builder (local proxy for in-library items, TMDB CDN
 * otherwise). Ported from the monolith `discovery/tmdb-service.ts` mappers.
 */
import type { DiscoverResult } from '../../../db/index.js';
import type { TmdbSearchResult } from '../../clients/tmdb/index.js';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

/** Poster url: local proxy for library items, TMDB CDN for non-library items. */
export function buildPosterUrl(
  posterPath: string | null,
  tmdbId: number,
  inLibrary: boolean
): string | null {
  if (!posterPath) return null;
  if (inLibrary) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return `${TMDB_IMAGE_BASE}${posterPath}`;
}

export interface FlagSets {
  libraryIds: Set<number>;
  watchedIds: Set<number>;
  watchlistIds: Set<number>;
  dismissedIds: Set<number>;
}

/** Map one TMDB result to a {@link DiscoverResult} with library/watch flags. */
export function toDiscoverResult(r: TmdbSearchResult, flags: FlagSets): DiscoverResult {
  const inLibrary = flags.libraryIds.has(r.tmdbId);
  return {
    tmdbId: r.tmdbId,
    title: r.title,
    overview: r.overview,
    releaseDate: r.releaseDate,
    posterPath: r.posterPath,
    posterUrl: buildPosterUrl(r.posterPath, r.tmdbId, inLibrary),
    backdropPath: r.backdropPath,
    voteAverage: r.voteAverage,
    voteCount: r.voteCount,
    genreIds: r.genreIds,
    popularity: r.popularity,
    inLibrary,
    isWatched: flags.watchedIds.has(r.tmdbId),
    onWatchlist: flags.watchlistIds.has(r.tmdbId),
  };
}

/** Map + drop dismissed; preserves input order. */
export function toDiscoverResults(results: TmdbSearchResult[], flags: FlagSets): DiscoverResult[] {
  return results
    .filter((r) => !flags.dismissedIds.has(r.tmdbId))
    .map((r) => toDiscoverResult(r, flags));
}
