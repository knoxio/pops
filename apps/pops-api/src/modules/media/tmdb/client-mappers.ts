import type {
  RawTmdbImageResponse,
  RawTmdbMovieDetail,
  RawTmdbSearchResponse,
  TmdbImage,
  TmdbImageResponse,
  TmdbMovieDetail,
  TmdbSearchResponse,
} from './types.js';

type RawMovieResult = RawTmdbSearchResponse['results'][number];

export function mapMovieResult(r: RawMovieResult): TmdbSearchResponse['results'][number] {
  return {
    tmdbId: r.id,
    title: r.title,
    originalTitle: r.original_title,
    overview: r.overview,
    releaseDate: r.release_date,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    voteAverage: r.vote_average,
    voteCount: r.vote_count,
    genreIds: r.genre_ids,
    originalLanguage: r.original_language,
    popularity: r.popularity,
  };
}

export function mapSearchResponse(raw: RawTmdbSearchResponse): TmdbSearchResponse {
  return {
    page: raw.page,
    totalResults: raw.total_results,
    totalPages: raw.total_pages,
    results: raw.results.map(mapMovieResult),
  };
}

export function mapMovieDetail(raw: RawTmdbMovieDetail): TmdbMovieDetail {
  return {
    tmdbId: raw.id,
    imdbId: raw.imdb_id,
    title: raw.title,
    originalTitle: raw.original_title,
    overview: raw.overview,
    tagline: raw.tagline,
    releaseDate: raw.release_date,
    runtime: raw.runtime,
    status: raw.status,
    originalLanguage: raw.original_language,
    budget: raw.budget,
    revenue: raw.revenue,
    posterPath: raw.poster_path,
    backdropPath: raw.backdrop_path,
    voteAverage: raw.vote_average,
    voteCount: raw.vote_count,
    genres: raw.genres,
    productionCompanies: raw.production_companies,
    spokenLanguages: raw.spoken_languages,
  };
}

function mapImage(img: RawTmdbImageResponse['backdrops'][number]): TmdbImage {
  return {
    filePath: img.file_path,
    width: img.width,
    height: img.height,
    aspectRatio: img.aspect_ratio,
    voteAverage: img.vote_average,
    voteCount: img.vote_count,
    languageCode: img.iso_639_1,
  };
}

export function mapImageResponse(raw: RawTmdbImageResponse): TmdbImageResponse {
  return {
    id: raw.id,
    backdrops: raw.backdrops.map(mapImage),
    posters: raw.posters.map(mapImage),
    logos: raw.logos.map(mapImage),
  };
}

export interface DiscoverOpts {
  genreIds?: number[];
  keywordIds?: number[];
  sortBy?: string;
  voteCountGte?: number;
  voteCountLte?: number;
  voteAverageGte?: number;
  releaseDateGte?: string;
  releaseDateLte?: string;
  page?: number;
}

export function buildDiscoverParams(opts: DiscoverOpts): URLSearchParams {
  const params = new URLSearchParams({ language: 'en-US' });
  if (opts.genreIds?.length) params.set('with_genres', opts.genreIds.join(','));
  if (opts.keywordIds?.length) params.set('with_keywords', opts.keywordIds.join('|'));
  if (opts.sortBy) params.set('sort_by', opts.sortBy);
  if (opts.voteCountGte != null) params.set('vote_count.gte', String(opts.voteCountGte));
  if (opts.voteCountLte != null) params.set('vote_count.lte', String(opts.voteCountLte));
  if (opts.voteAverageGte != null) params.set('vote_average.gte', String(opts.voteAverageGte));
  if (opts.releaseDateGte) params.set('primary_release_date.gte', opts.releaseDateGte);
  if (opts.releaseDateLte) params.set('primary_release_date.lte', opts.releaseDateLte);
  params.set('page', String(opts.page ?? 1));
  return params;
}
