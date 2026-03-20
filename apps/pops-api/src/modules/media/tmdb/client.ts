/**
 * TMDB v3 HTTP client — typed wrapper around the TMDB REST API.
 *
 * Handles authentication (Bearer token), request construction,
 * response parsing, and error mapping. Contains no business logic.
 */
import {
  TmdbApiError,
  type TmdbSearchResponse,
  type TmdbMovieDetail,
  type TmdbImageResponse,
  type TmdbGenreListResponse,
  type TmdbImage,
  type RawTmdbSearchResponse,
  type RawTmdbMovieDetail,
  type RawTmdbImageResponse,
} from "./types.js";
import type { TokenBucketRateLimiter } from "./rate-limiter.js";

const BASE_URL = "https://api.themoviedb.org";

export class TmdbClient {
  private readonly apiKey: string;
  private readonly rateLimiter: TokenBucketRateLimiter | null;

  constructor(apiKey: string, rateLimiter?: TokenBucketRateLimiter) {
    if (!apiKey) {
      throw new Error("TMDB API key is required");
    }
    this.apiKey = apiKey;
    this.rateLimiter = rateLimiter ?? null;
  }

  /** Search movies by query string. */
  async searchMovies(query: string, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({
      query,
      page: String(page),
      language: "en-US",
    });

    const raw = await this.get<RawTmdbSearchResponse>(`/3/search/movie?${params.toString()}`);

    return {
      page: raw.page,
      totalResults: raw.total_results,
      totalPages: raw.total_pages,
      results: raw.results.map((r) => ({
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
      })),
    };
  }

  /** Get full movie detail by TMDB ID. */
  async getMovie(tmdbId: number): Promise<TmdbMovieDetail> {
    const raw = await this.get<RawTmdbMovieDetail>(`/3/movie/${tmdbId}?language=en-US`);

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

  /** Get images (posters, backdrops, logos) for a movie. */
  async getMovieImages(tmdbId: number): Promise<TmdbImageResponse> {
    const raw = await this.get<RawTmdbImageResponse>(`/3/movie/${tmdbId}/images`);

    const mapImage = (img: RawTmdbImageResponse["backdrops"][number]): TmdbImage => ({
      filePath: img.file_path,
      width: img.width,
      height: img.height,
      aspectRatio: img.aspect_ratio,
      voteAverage: img.vote_average,
      voteCount: img.vote_count,
      languageCode: img.iso_639_1,
    });

    return {
      id: raw.id,
      backdrops: raw.backdrops.map(mapImage),
      posters: raw.posters.map(mapImage),
      logos: raw.logos.map(mapImage),
    };
  }

  /** Get the full list of TMDB movie genres. */
  async getGenreList(): Promise<TmdbGenreListResponse> {
    return this.get<TmdbGenreListResponse>("/3/genre/movie/list?language=en-US");
  }

  /** Generic GET with Bearer auth, rate limiting, and error handling. */
  private async get<T>(path: string): Promise<T> {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }

    let response: Response;

    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      });
    } catch (err) {
      throw new TmdbApiError(
        0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      let message = `TMDB API error: ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { status_message?: string };
        if (body.status_message) {
          message = body.status_message;
        }
      } catch {
        // Ignore JSON parse failures — use default message
      }
      throw new TmdbApiError(response.status, message);
    }

    return (await response.json()) as T;
  }
}
