import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TmdbClient } from "../tmdb/client.js";
import type { TmdbSearchResponse } from "../tmdb/types.js";
import type { PreferenceProfile } from "./types.js";

vi.mock("./flags.js", () => ({
  getDismissedTmdbIds: vi.fn().mockReturnValue(new Set()),
}));

import { getDismissedTmdbIds } from "./flags.js";
import { selectTopGenres, getGenreSpotlight, getGenreSpotlightPage } from "./genre-spotlight-service.js";

const mockGetDismissedTmdbIds = vi.mocked(getDismissedTmdbIds);

/** Build a minimal PreferenceProfile. */
function makeProfile(overrides: Partial<PreferenceProfile> = {}): PreferenceProfile {
  return {
    genreAffinities: [],
    dimensionWeights: [],
    genreDistribution: [],
    totalMoviesWatched: 0,
    totalComparisons: 0,
    ...overrides,
  };
}

/** Build a mock TMDB search response. */
function makeTmdbResponse(tmdbIds: number[]): TmdbSearchResponse {
  return {
    page: 1,
    totalResults: tmdbIds.length,
    totalPages: 1,
    results: tmdbIds.map((id) => ({
      tmdbId: id,
      title: `Movie ${id}`,
      originalTitle: `Movie ${id}`,
      overview: "Test movie",
      releaseDate: "2025-06-01",
      posterPath: `/poster${id}.jpg`,
      backdropPath: null,
      voteAverage: 7.5,
      voteCount: 500,
      genreIds: [35],
      originalLanguage: "en",
      popularity: 50,
    })),
  };
}

function makeMockClient(): TmdbClient {
  return {
    discoverMovies: vi.fn(async () => makeTmdbResponse([1, 2, 3])),
  } as unknown as TmdbClient;
}

describe("selectTopGenres", () => {
  it("selects up to 3 genres from ELO affinities", () => {
    const result = selectTopGenres(
      [
        { genre: "Action", avgScore: 8.5, movieCount: 10, totalComparisons: 20 },
        { genre: "Comedy", avgScore: 7.5, movieCount: 8, totalComparisons: 15 },
        { genre: "Drama", avgScore: 7.0, movieCount: 12, totalComparisons: 18 },
        { genre: "Horror", avgScore: 6.5, movieCount: 5, totalComparisons: 10 },
      ],
      []
    );

    expect(result).toHaveLength(3);
    expect(result).toEqual(["Action", "Comedy", "Drama"]);
  });

  it("avoids related genre pairs (Action + Adventure)", () => {
    const result = selectTopGenres(
      [
        { genre: "Action", avgScore: 8.5, movieCount: 10, totalComparisons: 20 },
        { genre: "Adventure", avgScore: 8.0, movieCount: 8, totalComparisons: 15 },
        { genre: "Comedy", avgScore: 7.5, movieCount: 12, totalComparisons: 18 },
        { genre: "Drama", avgScore: 7.0, movieCount: 5, totalComparisons: 10 },
      ],
      []
    );

    expect(result).toContain("Action");
    expect(result).not.toContain("Adventure");
    expect(result).toContain("Comedy");
    expect(result).toContain("Drama");
  });

  it("avoids related genre pairs (Mystery + Thriller)", () => {
    const result = selectTopGenres(
      [
        { genre: "Thriller", avgScore: 9.0, movieCount: 10, totalComparisons: 20 },
        { genre: "Mystery", avgScore: 8.5, movieCount: 8, totalComparisons: 15 },
        { genre: "Comedy", avgScore: 7.5, movieCount: 12, totalComparisons: 18 },
      ],
      []
    );

    expect(result).toContain("Thriller");
    expect(result).not.toContain("Mystery");
    expect(result).toContain("Comedy");
  });

  it("falls back to watch history distribution when no ELO data", () => {
    const result = selectTopGenres(
      [],
      [
        { genre: "Drama", watchCount: 20, percentage: 40 },
        { genre: "Comedy", watchCount: 15, percentage: 30 },
        { genre: "Horror", watchCount: 10, percentage: 20 },
      ]
    );

    expect(result).toEqual(["Drama", "Comedy", "Horror"]);
  });

  it("returns empty when no genre data", () => {
    const result = selectTopGenres([], []);
    expect(result).toEqual([]);
  });

  it("skips genres without TMDB ID mapping", () => {
    const result = selectTopGenres(
      [
        { genre: "MadeUpGenre", avgScore: 9.0, movieCount: 10, totalComparisons: 20 },
        { genre: "Comedy", avgScore: 7.5, movieCount: 8, totalComparisons: 15 },
      ],
      []
    );

    expect(result).not.toContain("MadeUpGenre");
    expect(result).toContain("Comedy");
  });
});

describe("getGenreSpotlight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns scored results per genre", async () => {
    const client = makeMockClient();
    const profile = makeProfile({
      genreAffinities: [
        { genre: "Action", avgScore: 8.5, movieCount: 10, totalComparisons: 20 },
        { genre: "Comedy", avgScore: 7.5, movieCount: 8, totalComparisons: 15 },
      ],
    });

    const result = await getGenreSpotlight(client, profile, new Set());

    expect(result.genres).toHaveLength(2);
    expect(result.genres[0]!.genreName).toBe("Action");
    expect(result.genres[0]!.genreId).toBe(28);
    expect(result.genres[1]!.genreName).toBe("Comedy");
    expect(result.genres[1]!.genreId).toBe(35);
    // Each genre should have scored results
    expect(result.genres[0]!.results.length).toBeGreaterThan(0);
    expect(result.genres[0]!.results[0]).toHaveProperty("matchPercentage");
  });

  it("excludes library movies from results", async () => {
    const client = {
      discoverMovies: vi.fn(async () => makeTmdbResponse([100, 200, 300])),
    } as unknown as TmdbClient;

    const profile = makeProfile({
      genreAffinities: [{ genre: "Comedy", avgScore: 7.5, movieCount: 8, totalComparisons: 15 }],
    });

    const libraryIds = new Set([100, 200]);
    const result = await getGenreSpotlight(client, profile, libraryIds);

    const tmdbIds = result.genres[0]!.results.map((r) => r.tmdbId);
    expect(tmdbIds).toEqual([300]);
  });

  it("returns empty when no genre data", async () => {
    const client = makeMockClient();
    const profile = makeProfile();

    const result = await getGenreSpotlight(client, profile, new Set());

    expect(result.genres).toEqual([]);
  });

  it("excludes dismissed movies from results", async () => {
    const client = {
      discoverMovies: vi.fn(async () => makeTmdbResponse([100, 200, 300])),
    } as unknown as TmdbClient;
    const profile = makeProfile({
      genreAffinities: [{ genre: "Comedy", avgScore: 7.5, movieCount: 8, totalComparisons: 15 }],
    });

    mockGetDismissedTmdbIds.mockReturnValue(new Set([200]));

    const result = await getGenreSpotlight(client, profile, new Set());

    const tmdbIds = result.genres[0]!.results.map((r) => r.tmdbId);
    expect(tmdbIds).not.toContain(200);
    expect(tmdbIds).toContain(100);
    expect(tmdbIds).toContain(300);
  });

  it("calls TMDB discover with correct genre ID and params", async () => {
    const client = makeMockClient();
    const profile = makeProfile({
      genreAffinities: [{ genre: "Horror", avgScore: 8.0, movieCount: 5, totalComparisons: 10 }],
    });

    await getGenreSpotlight(client, profile, new Set());

    expect(client.discoverMovies).toHaveBeenCalledWith({
      genreIds: [27], // Horror = 27
      sortBy: "vote_average.desc",
      voteCountGte: 100,
      page: 1,
    });
  });
});

describe("getGenreSpotlightPage — dismissed filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDismissedTmdbIds.mockReturnValue(new Set());
  });

  it("excludes dismissed movies from page results", async () => {
    const client = {
      discoverMovies: vi.fn(async () => makeTmdbResponse([10, 20, 30])),
    } as unknown as TmdbClient;
    const profile = makeProfile();

    mockGetDismissedTmdbIds.mockReturnValue(new Set([20]));

    const result = await getGenreSpotlightPage(client, profile, new Set(), 35, 2);

    const tmdbIds = result.results.map((r) => r.tmdbId);
    expect(tmdbIds).not.toContain(20);
    expect(tmdbIds).toContain(10);
    expect(tmdbIds).toContain(30);
  });

  it("excludes library movies from page results", async () => {
    const client = {
      discoverMovies: vi.fn(async () => makeTmdbResponse([10, 20, 30])),
    } as unknown as TmdbClient;
    const profile = makeProfile();

    const result = await getGenreSpotlightPage(client, profile, new Set([10]), 35, 2);

    const tmdbIds = result.results.map((r) => r.tmdbId);
    expect(tmdbIds).not.toContain(10);
    expect(tmdbIds).toContain(20);
    expect(tmdbIds).toContain(30);
  });
});
