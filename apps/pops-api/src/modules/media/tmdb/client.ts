import {
  buildDiscoverParams,
  mapImageResponse,
  mapMovieDetail,
  mapSearchResponse,
  type DiscoverOpts,
} from './client-mappers.js';
import {
  type RawTmdbImageResponse,
  type RawTmdbMovieDetail,
  type RawTmdbRecommendationsResponse,
  type RawTmdbSearchResponse,
  type RawTmdbTrendingResponse,
  TmdbApiError,
  type TmdbGenreListResponse,
  type TmdbImageResponse,
  type TmdbMovieCredits,
  type TmdbMovieDetail,
  type TmdbSearchResponse,
} from './types.js';

/**
 * TMDB v3 HTTP client — typed wrapper around the TMDB REST API.
 *
 * Handles authentication (Bearer token), request construction,
 * response parsing, and error mapping. Mapper functions live in
 * `client-mappers.ts`; discover query params use `buildDiscoverParams`.
 */
import type { TokenBucketRateLimiter } from './rate-limiter.js';

const BASE_URL = 'https://api.themoviedb.org';
const PAGED_LANG = 'language=en-US';

export class TmdbClient {
  private readonly apiKey: string;
  private readonly rateLimiter: TokenBucketRateLimiter | null;

  constructor(apiKey: string, rateLimiter?: TokenBucketRateLimiter) {
    if (!apiKey) throw new Error('TMDB API key is required');
    this.apiKey = apiKey;
    this.rateLimiter = rateLimiter ?? null;
  }

  /** Search movies by query string. */
  async searchMovies(query: string, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({ query, page: String(page), language: 'en-US' });
    const raw = await this.get<RawTmdbSearchResponse>(`/3/search/movie?${params.toString()}`);
    return mapSearchResponse(raw);
  }

  /** Get full movie detail by TMDB ID. */
  async getMovie(tmdbId: number): Promise<TmdbMovieDetail> {
    const raw = await this.get<RawTmdbMovieDetail>(`/3/movie/${tmdbId}?${PAGED_LANG}`);
    return mapMovieDetail(raw);
  }

  /** Get images (posters, backdrops, logos) for a movie. */
  async getMovieImages(tmdbId: number): Promise<TmdbImageResponse> {
    const raw = await this.get<RawTmdbImageResponse>(`/3/movie/${tmdbId}/images`);
    return mapImageResponse(raw);
  }

  /** Get trending movies (daily or weekly). */
  async getTrendingMovies(
    timeWindow: 'day' | 'week' = 'week',
    page = 1
  ): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({ page: String(page), language: 'en-US' });
    const raw = await this.get<RawTmdbTrendingResponse>(
      `/3/trending/movie/${timeWindow}?${params.toString()}`
    );
    return mapSearchResponse(raw);
  }

  /** Get movie recommendations based on a specific movie. */
  async getMovieRecommendations(tmdbId: number, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({ page: String(page), language: 'en-US' });
    const raw = await this.get<RawTmdbRecommendationsResponse>(
      `/3/movie/${tmdbId}/recommendations?${params.toString()}`
    );
    return mapSearchResponse(raw);
  }

  /** Get similar movies based on a specific movie. */
  async getMovieSimilar(tmdbId: number, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({ page: String(page), language: 'en-US' });
    const raw = await this.get<RawTmdbRecommendationsResponse>(
      `/3/movie/${tmdbId}/similar?${params.toString()}`
    );
    return mapSearchResponse(raw);
  }

  /** Get crew and cast for a movie. */
  async getMovieCredits(tmdbId: number): Promise<TmdbMovieCredits> {
    return this.get<TmdbMovieCredits>(`/3/movie/${tmdbId}/credits?${PAGED_LANG}`);
  }

  /** Discover movies by crew person ID (e.g. director). */
  async discoverMoviesByCrew(personId: number, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({
      with_crew: String(personId),
      sort_by: 'vote_average.desc',
      'vote_count.gte': '50',
      language: 'en-US',
      page: String(page),
    });
    const raw = await this.get<RawTmdbSearchResponse>(`/3/discover/movie?${params.toString()}`);
    return mapSearchResponse(raw);
  }

  /** Discover movies by cast person ID. */
  async discoverMoviesByCast(personId: number, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({
      with_cast: String(personId),
      sort_by: 'vote_average.desc',
      'vote_count.gte': '50',
      language: 'en-US',
      page: String(page),
    });
    const raw = await this.get<RawTmdbSearchResponse>(`/3/discover/movie?${params.toString()}`);
    return mapSearchResponse(raw);
  }

  /** Discover movies by genre IDs and/or keyword IDs, with configurable sort and filters. */
  async discoverMovies(opts: DiscoverOpts): Promise<TmdbSearchResponse> {
    const params = buildDiscoverParams(opts);
    const raw = await this.get<RawTmdbSearchResponse>(`/3/discover/movie?${params.toString()}`);
    return mapSearchResponse(raw);
  }

  /** Get the full list of TMDB movie genres. */
  async getGenreList(): Promise<TmdbGenreListResponse> {
    return this.get<TmdbGenreListResponse>(`/3/genre/movie/list?${PAGED_LANG}`);
  }

  /** Generic GET with Bearer auth, rate limiting, and error handling. */
  private async get<T>(path: string): Promise<T> {
    if (this.rateLimiter) await this.rateLimiter.acquire();

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
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
        if (body.status_message) message = body.status_message;
      } catch {
        // Ignore JSON parse failures — use default message
      }
      throw new TmdbApiError(response.status, message);
    }

    return (await response.json()) as T;
  }
}
