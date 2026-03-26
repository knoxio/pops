/**
 * Media library service tests — refreshMovie with mocked TMDB client.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
  createCaller,
  seedMovie,
  seedTvShow,
} from "../../../shared/test-utils.js";
import type { TmdbMovieDetail } from "../tmdb/types.js";
import { TRPCError } from "@trpc/server";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
  // Set TMDB_API_KEY so the router can create a client
  vi.stubEnv("TMDB_API_KEY", "test-api-key");
});

afterEach(() => {
  ctx.teardown();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Build a fake TMDB movie detail response. */
function fakeTmdbDetail(overrides: Partial<TmdbMovieDetail> = {}): TmdbMovieDetail {
  return {
    tmdbId: 550,
    imdbId: "tt0137523",
    title: "Fight Club (Updated)",
    originalTitle: "Fight Club",
    overview: "Updated overview",
    tagline: "Updated tagline",
    releaseDate: "1999-10-15",
    runtime: 139,
    status: "Released",
    originalLanguage: "en",
    budget: 63000000,
    revenue: 101200000,
    posterPath: "/updated-poster.jpg",
    backdropPath: "/updated-backdrop.jpg",
    voteAverage: 8.5,
    voteCount: 26000,
    genres: [
      { id: 18, name: "Drama" },
      { id: 53, name: "Thriller" },
    ],
    productionCompanies: [{ id: 508, name: "Regency" }],
    spokenLanguages: [{ iso_639_1: "en", name: "English" }],
    ...overrides,
  };
}

/** Helper to mock global fetch for TMDB client calls. */
function mockTmdbFetch(detail: TmdbMovieDetail): void {
  const rawDetail = {
    id: detail.tmdbId,
    imdb_id: detail.imdbId,
    title: detail.title,
    original_title: detail.originalTitle,
    overview: detail.overview,
    tagline: detail.tagline,
    release_date: detail.releaseDate,
    runtime: detail.runtime,
    status: detail.status,
    original_language: detail.originalLanguage,
    budget: detail.budget,
    revenue: detail.revenue,
    poster_path: detail.posterPath,
    backdrop_path: detail.backdropPath,
    vote_average: detail.voteAverage,
    vote_count: detail.voteCount,
    genres: detail.genres,
    production_companies: detail.productionCompanies,
    spoken_languages: detail.spokenLanguages,
  };

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(rawDetail),
      headers: new Headers(),
      redirected: false,
      type: "basic",
      url: "",
      clone: vi.fn(),
      body: null,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      text: () => Promise.resolve(JSON.stringify(rawDetail)),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response)
  );
}

describe("media.library.refreshMovie", () => {
  it("refreshes movie metadata from TMDB", async () => {
    const movieId = seedMovie(db, {
      tmdb_id: 550,
      title: "Fight Club",
      overview: "Old overview",
      genres: '["Action"]',
    });

    const detail = fakeTmdbDetail();
    mockTmdbFetch(detail);

    const result = await caller.media.library.refreshMovie({
      id: movieId,
    });

    expect(result.message).toBe("Movie metadata refreshed");
    expect(result.data.title).toBe("Fight Club (Updated)");
    expect(result.data.overview).toBe("Updated overview");
    expect(result.data.tagline).toBe("Updated tagline");
    expect(result.data.voteAverage).toBe(8.5);
    expect(result.data.voteCount).toBe(26000);
    expect(result.data.genres).toEqual(["Drama", "Thriller"]);
    expect(result.data.posterPath).toBe("/updated-poster.jpg");
    expect(result.data.backdropPath).toBe("/updated-backdrop.jpg");
  });

  it("preserves poster_override_path", async () => {
    const movieId = seedMovie(db, {
      tmdb_id: 550,
      title: "Fight Club",
      poster_override_path: "/my-custom-poster.jpg",
    });

    mockTmdbFetch(fakeTmdbDetail());

    const result = await caller.media.library.refreshMovie({
      id: movieId,
    });

    expect(result.data.posterOverridePath).toBe("/my-custom-poster.jpg");
  });

  it("updates updatedAt timestamp", async () => {
    const movieId = seedMovie(db, {
      tmdb_id: 550,
      title: "Fight Club",
    });

    // Get the original updatedAt
    const before = db.prepare("SELECT updated_at FROM movies WHERE id = ?").get(movieId) as {
      updated_at: string;
    };

    mockTmdbFetch(fakeTmdbDetail());

    const result = await caller.media.library.refreshMovie({
      id: movieId,
    });

    // updatedAt should be different (newer)
    expect(result.data.updatedAt).not.toBe(before.updated_at);
  });

  it("throws NOT_FOUND when movie does not exist", async () => {
    expect.assertions(2);
    mockTmdbFetch(fakeTmdbDetail());

    try {
      await caller.media.library.refreshMovie({ id: 999 });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("throws INTERNAL_SERVER_ERROR on TMDB API failure", async () => {
    expect.assertions(2);
    const movieId = seedMovie(db, { tmdb_id: 550, title: "Fight Club" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ status_message: "Invalid API key" }),
        headers: new Headers(),
        redirected: false,
        type: "basic",
        url: "",
        clone: vi.fn(),
        body: null,
        bodyUsed: false,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        text: () => Promise.resolve(""),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response)
    );

    try {
      await caller.media.library.refreshMovie({ id: movieId });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
    }
  });

  it("throws UNAUTHORIZED without auth", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.media.library.refreshMovie({ id: 1 })).rejects.toThrow(TRPCError);
  });

  it("maps all TMDB genre names", async () => {
    const movieId = seedMovie(db, { tmdb_id: 550, title: "Test" });

    const detail = fakeTmdbDetail({
      genres: [
        { id: 28, name: "Action" },
        { id: 35, name: "Comedy" },
        { id: 878, name: "Science Fiction" },
      ],
    });
    mockTmdbFetch(detail);

    const result = await caller.media.library.refreshMovie({ id: movieId });

    expect(result.data.genres).toEqual(["Action", "Comedy", "Science Fiction"]);
  });

  it("handles TMDB returning null for optional fields", async () => {
    const movieId = seedMovie(db, {
      tmdb_id: 550,
      title: "Test",
      overview: "Old overview",
      tagline: "Old tagline",
    });

    const detail = fakeTmdbDetail({
      overview: "",
      tagline: "",
      imdbId: null,
      posterPath: null,
      backdropPath: null,
    });
    mockTmdbFetch(detail);

    const result = await caller.media.library.refreshMovie({ id: movieId });

    expect(result.data.overview).toBe("");
    expect(result.data.tagline).toBe("");
    expect(result.data.imdbId).toBeNull();
    expect(result.data.posterPath).toBeNull();
    expect(result.data.backdropPath).toBeNull();
  });
});

describe("media.library.list", () => {
  it("returns combined movies and TV shows", async () => {
    seedMovie(db, { tmdb_id: 1, title: "Inception", genres: '["Sci-Fi"]' });
    seedTvShow(db, { tvdb_id: 1, name: "Breaking Bad", genres: '["Drama"]' });

    const result = await caller.media.library.list({});

    expect(result.items).toHaveLength(2);
    const types = result.items.map((i: { type: string }) => i.type).sort();
    expect(types).toEqual(["movie", "tv"]);
  });

  it("filters by type=movie", async () => {
    seedMovie(db, { tmdb_id: 1, title: "Inception" });
    seedTvShow(db, { tvdb_id: 1, name: "Breaking Bad" });

    const result = await caller.media.library.list({ type: "movie" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.type).toBe("movie");
    expect(result.items[0]!.title).toBe("Inception");
  });

  it("filters by type=tv", async () => {
    seedMovie(db, { tmdb_id: 1, title: "Inception" });
    seedTvShow(db, { tvdb_id: 1, name: "Breaking Bad" });

    const result = await caller.media.library.list({ type: "tv" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.type).toBe("tv");
    expect(result.items[0]!.title).toBe("Breaking Bad");
  });

  it("filters by search query", async () => {
    seedMovie(db, { tmdb_id: 1, title: "Inception" });
    seedMovie(db, { tmdb_id: 2, title: "Interstellar" });
    seedTvShow(db, { tvdb_id: 1, name: "Breaking Bad" });

    const result = await caller.media.library.list({ search: "Inter" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Interstellar");
  });

  it("filters by genre", async () => {
    seedMovie(db, { tmdb_id: 1, title: "Inception", genres: '["Sci-Fi","Action"]' });
    seedMovie(db, { tmdb_id: 2, title: "The Notebook", genres: '["Romance"]' });
    seedTvShow(db, { tvdb_id: 1, name: "Stranger Things", genres: '["Sci-Fi","Horror"]' });

    const result = await caller.media.library.list({ genre: "Sci-Fi" });

    expect(result.items).toHaveLength(2);
    const titles = result.items.map((i: { title: string }) => i.title).sort();
    expect(titles).toEqual(["Inception", "Stranger Things"]);
  });

  it("sorts by title", async () => {
    seedMovie(db, { tmdb_id: 1, title: "Zodiac" });
    seedMovie(db, { tmdb_id: 2, title: "Alien" });
    seedTvShow(db, { tvdb_id: 1, name: "Better Call Saul" });

    const result = await caller.media.library.list({ sort: "title" });

    const titles = result.items.map((i: { title: string }) => i.title);
    expect(titles).toEqual(["Alien", "Better Call Saul", "Zodiac"]);
  });

  it("sorts by rating descending", async () => {
    seedMovie(db, { tmdb_id: 1, title: "Average", vote_average: 5.0 });
    seedMovie(db, { tmdb_id: 2, title: "Great", vote_average: 9.0 });
    seedMovie(db, { tmdb_id: 3, title: "Good", vote_average: 7.0 });

    const result = await caller.media.library.list({ sort: "rating" });

    const titles = result.items.map((i: { title: string }) => i.title);
    expect(titles).toEqual(["Great", "Good", "Average"]);
  });

  it("paginates results", async () => {
    for (let i = 1; i <= 5; i++) {
      seedMovie(db, { tmdb_id: i, title: `Movie ${i}` });
    }

    const page1 = await caller.media.library.list({ page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.page).toBe(1);

    const page3 = await caller.media.library.list({ page: 3, pageSize: 2 });
    expect(page3.items).toHaveLength(1);
    expect(page3.page).toBe(3);
  });

  it("returns correct posterUrl for movies", async () => {
    seedMovie(db, { tmdb_id: 42, title: "Test Movie", poster_path: "/poster.jpg" });

    const result = await caller.media.library.list({ type: "movie" });

    expect(result.items[0]!.posterUrl).toBe("/media/images/movie/42/poster.jpg");
  });

  it("returns correct posterUrl for TV shows", async () => {
    seedTvShow(db, { tvdb_id: 99, name: "Test Show", poster_path: "/poster.jpg" });

    const result = await caller.media.library.list({ type: "tv" });

    expect(result.items[0]!.posterUrl).toBe("/media/images/tv/99/poster.jpg");
  });

  it("prefers poster_override_path over poster_path", async () => {
    seedMovie(db, {
      tmdb_id: 42,
      title: "Test",
      poster_path: "/poster.jpg",
      poster_override_path: "/custom.jpg",
    });

    const result = await caller.media.library.list({ type: "movie" });

    expect(result.items[0]!.posterUrl).toBe("/custom.jpg");
  });

  it("extracts year from release date", async () => {
    seedMovie(db, { tmdb_id: 1, title: "Test", release_date: "2024-06-15" });

    const result = await caller.media.library.list({});

    expect(result.items[0]!.year).toBe(2024);
  });

  it("returns empty items when library is empty", async () => {
    const result = await caller.media.library.list({});

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });
});
