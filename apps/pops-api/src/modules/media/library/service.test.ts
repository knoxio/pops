/**
 * Media library service tests — refreshMovie with mocked TMDB client.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "better-sqlite3";
import { setupTestContext, createCaller, seedMovie } from "../../../shared/test-utils.js";
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
