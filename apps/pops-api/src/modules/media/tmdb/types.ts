/**
 * TMDB API v3 response types and error class.
 */

/** Typed error for TMDB API failures. */
export class TmdbApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "TmdbApiError";
  }
}

/** A single movie result from TMDB search. */
export interface TmdbSearchResult {
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
  originalLanguage: string;
  popularity: number;
}

/** Paginated search response from TMDB. */
export interface TmdbSearchResponse {
  results: TmdbSearchResult[];
  totalResults: number;
  totalPages: number;
  page: number;
}

/** Full movie detail from TMDB. */
export interface TmdbMovieDetail {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string;
  overview: string;
  tagline: string;
  releaseDate: string;
  runtime: number;
  status: string;
  originalLanguage: string;
  budget: number;
  revenue: number;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genres: { id: number; name: string }[];
  productionCompanies: { id: number; name: string }[];
  spokenLanguages: { iso_639_1: string; name: string }[];
}

/** A single image entry from TMDB images endpoint. */
export interface TmdbImage {
  filePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  voteAverage: number;
  voteCount: number;
  languageCode: string | null;
}

/** Response from TMDB movie images endpoint. */
export interface TmdbImageResponse {
  id: number;
  backdrops: TmdbImage[];
  posters: TmdbImage[];
  logos: TmdbImage[];
}

/** A single genre from TMDB genre list. */
export interface TmdbGenre {
  id: number;
  name: string;
}

/** Response from TMDB genre list endpoint. */
export interface TmdbGenreListResponse {
  genres: TmdbGenre[];
}

/** Raw TMDB API search result shape (snake_case). */
export interface RawTmdbSearchResult {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  original_language: string;
  popularity: number;
}

/** Raw TMDB API search response. */
export interface RawTmdbSearchResponse {
  page: number;
  results: RawTmdbSearchResult[];
  total_results: number;
  total_pages: number;
}

/** Raw TMDB API movie detail shape (snake_case). */
export interface RawTmdbMovieDetail {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  overview: string;
  tagline: string;
  release_date: string;
  runtime: number;
  status: string;
  original_language: string;
  budget: number;
  revenue: number;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  genres: { id: number; name: string }[];
  production_companies: { id: number; name: string }[];
  spoken_languages: { iso_639_1: string; name: string }[];
}

/** Raw TMDB API image entry. */
export interface RawTmdbImage {
  file_path: string;
  width: number;
  height: number;
  aspect_ratio: number;
  vote_average: number;
  vote_count: number;
  iso_639_1: string | null;
}

/** Raw TMDB API images response. */
export interface RawTmdbImageResponse {
  id: number;
  backdrops: RawTmdbImage[];
  posters: RawTmdbImage[];
  logos: RawTmdbImage[];
}

/** Raw TMDB API trending response (same shape as search). */
export interface RawTmdbTrendingResponse {
  page: number;
  results: RawTmdbSearchResult[];
  total_results: number;
  total_pages: number;
}

/** Raw TMDB API recommendations response (same shape as search). */
export interface RawTmdbRecommendationsResponse {
  page: number;
  results: RawTmdbSearchResult[];
  total_results: number;
  total_pages: number;
}

/** A crew member from TMDB credits. */
export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
}

/** A cast member from TMDB credits. */
export interface TmdbCastMember {
  id: number;
  name: string;
  order: number;
}

/** Credits for a movie from TMDB. */
export interface TmdbMovieCredits {
  id: number;
  crew: TmdbCrewMember[];
  cast: TmdbCastMember[];
}
