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
  type TmdbMovieCredits,
  type RawTmdbSearchResponse,
  type RawTmdbMovieDetail,
  type RawTmdbImageResponse,
  type RawTmdbTrendingResponse,
  type RawTmdbRecommendationsResponse,
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

  /** Get trending movies (daily or weekly). */
  async getTrendingMovies(
    timeWindow: "day" | "week" = "week",
    page = 1
  ): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({
      page: String(page),
      language: "en-US",
    });

    const raw = await this.get<RawTmdbTrendingResponse>(
      `/3/trending/movie/${timeWindow}?${params.toString()}`
    );

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

  /** Get movie recommendations based on a specific movie. */
  async getMovieRecommendations(tmdbId: number, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({
      page: String(page),
      language: "en-US",
    });

    const raw = await this.get<RawTmdbRecommendationsResponse>(
      `/3/movie/${tmdbId}/recommendations?${params.toString()}`
    );

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

  /** Get similar movies based on a specific movie. */
  async getMovieSimilar(tmdbId: number, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({
      page: String(page),
      language: "en-US",
    });

    const raw = await this.get<RawTmdbRecommendationsResponse>(
      `/3/movie/${tmdbId}/similar?${params.toString()}`
    );

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

  /** Get crew and cast for a movie. */
  async getMovieCredits(tmdbId: number): Promise<TmdbMovieCredits> {
    return this.get<TmdbMovieCredits>(`/3/movie/${tmdbId}/credits?language=en-US`);
  }

  /** Discover movies by crew person ID (e.g. director). */
  async discoverMoviesByCrew(personId: number, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({
      with_crew: String(personId),
      sort_by: "vote_average.desc",
      "vote_count.gte": "50",
      language: "en-US",
      page: String(page),
    });
    const raw = await this.get<RawTmdbSearchResponse>(`/3/discover/movie?${params.toString()}`);
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

  /** Discover movies by cast person ID. */
  async discoverMoviesByCast(personId: number, page = 1): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({
      with_cast: String(personId),
      sort_by: "vote_average.desc",
      "vote_count.gte": "50",
      language: "en-US",
      page: String(page),
    });
    const raw = await this.get<RawTmdbSearchResponse>(`/3/discover/movie?${params.toString()}`);
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

  /** Discover movies by genre IDs and/or keyword IDs, with configurable sort and filters. */
  async discoverMovies(opts: {
    genreIds?: number[];
    keywordIds?: number[];
    sortBy?: string;
    voteCountGte?: number;
    page?: number;
  }): Promise<TmdbSearchResponse> {
    const params = new URLSearchParams({ language: "en-US" });

    if (opts.genreIds?.length) {
      params.set("with_genres", opts.genreIds.join(","));
    }
    if (opts.keywordIds?.length) {
      params.set("with_keywords", opts.keywordIds.join("|"));
    }
    if (opts.sortBy) {
      params.set("sort_by", opts.sortBy);
    }
    if (opts.voteCountGte != null) {
      params.set("vote_count.gte", String(opts.voteCountGte));
    }
    params.set("page", String(opts.page ?? 1));

    const raw = await this.get<RawTmdbSearchResponse>(`/3/discover/movie?${params.toString()}`);

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
