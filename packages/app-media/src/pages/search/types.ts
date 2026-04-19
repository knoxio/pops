export type SearchMode = 'movies' | 'tv' | 'both';

/** TMDB movie search result shape (from media.search.movies). */
export interface MovieSearchResult {
  tmdbId: number;
  title: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  voteAverage: number;
  genreIds: number[];
}

/** TheTVDB search result shape (from media.search.tvShows). */
export interface TvSearchResult {
  tvdbId: number;
  name: string;
  overview: string | null;
  firstAirDate: string | null;
  posterPath: string | null;
  genres: string[];
  year: string | null;
}

export type { RotationMeta as RotationInfo } from '../../lib/types';
