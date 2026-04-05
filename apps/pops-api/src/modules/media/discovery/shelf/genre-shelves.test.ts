import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PreferenceProfile } from "../types.js";
import type { TmdbSearchResult } from "../../tmdb/types.js";

// ── Mutable state for overridable mocks ──────────────────────────────────────
const mockDismissedIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockWatchedIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockWatchlistIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockLibraryIds = vi.hoisted(() => ({ value: new Set<number>() }));
const mockTmdbResults = vi.hoisted(() => ({ value: [] as TmdbSearchResult[] }));

vi.mock("../../../../db.js", () => ({ getDrizzle: vi.fn() }));

vi.mock("@pops/db-types", () => ({
  movies: { id: "id", tmdbId: "tmdb_id", title: "title" },
  mediaScores: {
    mediaId: "media_id",
    mediaType: "media_type",
    dimensionId: "dimension_id",
    score: "score",
  },
  comparisonDimensions: { id: "id" },
}));

vi.mock("../../tmdb/index.js", () => ({
  getTmdbClient: vi.fn(() => ({
    discoverMovies: vi.fn().mockImplementation(async () => ({
      results: mockTmdbResults.value,
      page: 1,
      totalResults: mockTmdbResults.value.length,
      totalPages: 1,
    })),
    getMovieRecommendations: vi.fn().mockImplementation(async () => ({
      results: mockTmdbResults.value,
      page: 1,
      totalResults: mockTmdbResults.value.length,
      totalPages: 1,
    })),
  })),
}));

vi.mock("../tmdb-service.js", () => ({
  getLibraryTmdbIds: vi.fn(() => mockLibraryIds.value),
  toDiscoverResults: vi.fn(
    (
      results: TmdbSearchResult[],
      libraryIds: Set<number>,
      watchedIds: Set<number>,
      watchlistIds: Set<number>
    ) =>
      results.map((r) => ({
        tmdbId: r.tmdbId,
        title: r.title,
        overview: r.overview,
        releaseDate: r.releaseDate,
        posterPath: r.posterPath,
        posterUrl: null,
        backdropPath: r.backdropPath,
        voteAverage: r.voteAverage,
        voteCount: r.voteCount,
        genreIds: r.genreIds,
        popularity: r.popularity,
        inLibrary: libraryIds.has(r.tmdbId),
        isWatched: watchedIds.has(r.tmdbId),
        onWatchlist: watchlistIds.has(r.tmdbId),
      }))
  ),
}));

vi.mock("../flags.js", () => ({
  getDismissedTmdbIds: vi.fn(() => mockDismissedIds.value),
  getWatchedTmdbIds: vi.fn(() => mockWatchedIds.value),
  getWatchlistTmdbIds: vi.fn(() => mockWatchlistIds.value),
}));

vi.mock("../service.js", () => ({
  scoreDiscoverResults: vi.fn((results: Record<string, unknown>[]) =>
    results.map((r) => ({ ...r, matchPercentage: 75, matchReason: "Genre" }))
  ),
}));

vi.mock("./registry.js", () => ({ registerShelf: vi.fn() }));

import { getDrizzle } from "../../../../db.js";
import {
  bestInGenreShelf,
  genreCrossoverShelf,
  topDimensionShelf,
  dimensionInspiredShelf,
} from "./genre-shelves.js";
import { getTmdbClient } from "../../tmdb/index.js";

const mockGetDrizzle = vi.mocked(getDrizzle);
const mockGetTmdbClient = vi.mocked(getTmdbClient);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTmdbResult(tmdbId = 200): TmdbSearchResult {
  return {
    tmdbId,
    title: `Movie ${tmdbId}`,
    originalTitle: `Movie ${tmdbId}`,
    overview: "A film",
    releaseDate: "2024-01-01",
    posterPath: "/poster.jpg",
    backdropPath: null,
    voteAverage: 7.5,
    voteCount: 500,
    genreIds: [18],
    originalLanguage: "en",
    popularity: 30,
  };
}

/** Build a chainable Drizzle mock that returns `rows` from `.all()`. */
function makeMockDb(rows: Record<string, unknown>[]) {
  const mockAll = vi.fn().mockReturnValue(rows);
  const mockLimit = vi.fn().mockReturnValue({ all: mockAll });
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit, all: mockAll });
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  // innerJoin may be chained multiple times; each call returns an object with innerJoin again
  const mockInnerJoin: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => ({
    innerJoin: mockInnerJoin,
    where: mockWhere,
    orderBy: mockOrderBy,
  }));
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere });
  return {
    select: vi.fn().mockReturnValue({ from: mockFrom }),
  } as unknown as ReturnType<typeof getDrizzle>;
}

const profileWithGenres: PreferenceProfile = {
  genreAffinities: [
    { genre: "Drama", avgScore: 8.5, movieCount: 20, totalComparisons: 40 },
    { genre: "Action", avgScore: 7.0, movieCount: 15, totalComparisons: 30 },
    { genre: "Science Fiction", avgScore: 6.0, movieCount: 10, totalComparisons: 20 },
  ],
  dimensionWeights: [
    { dimensionId: 1, name: "Cinematography", avgScore: 1800, comparisonCount: 10 },
    { dimensionId: 2, name: "Story", avgScore: 1600, comparisonCount: 6 },
  ],
  genreDistribution: [],
  totalMoviesWatched: 50,
  totalComparisons: 100,
};

const emptyProfile: PreferenceProfile = {
  genreAffinities: [],
  dimensionWeights: [],
  genreDistribution: [],
  totalMoviesWatched: 0,
  totalComparisons: 0,
};

beforeEach(() => {
  mockDismissedIds.value = new Set();
  mockWatchedIds.value = new Set();
  mockWatchlistIds.value = new Set();
  mockLibraryIds.value = new Set();
  mockTmdbResults.value = [];
});

// ── best-in-genre ─────────────────────────────────────────────────────────────

describe("bestInGenreShelf — definition", () => {
  it("has id best-in-genre, template true, category seed", () => {
    expect(bestInGenreShelf.id).toBe("best-in-genre");
    expect(bestInGenreShelf.template).toBe(true);
    expect(bestInGenreShelf.category).toBe("seed");
  });
});

describe("bestInGenreShelf — generate()", () => {
  it("returns one instance per top genre (up to 5)", () => {
    const instances = bestInGenreShelf.generate(profileWithGenres);
    expect(instances).toHaveLength(3); // 3 genres in profile
  });

  it("returns empty when profile has no genre affinities", () => {
    const instances = bestInGenreShelf.generate(emptyProfile);
    expect(instances).toHaveLength(0);
  });

  it("shelfId is best-in-genre:{genre-slug}", () => {
    const instances = bestInGenreShelf.generate(profileWithGenres);
    expect(instances[0]!.shelfId).toBe("best-in-genre:drama");
  });

  it("title is 'Best in {Genre}'", () => {
    const instances = bestInGenreShelf.generate(profileWithGenres);
    expect(instances[0]!.title).toBe("Best in Drama");
  });

  it("instance score is between 0 and 1", () => {
    const instances = bestInGenreShelf.generate(profileWithGenres);
    for (const inst of instances) {
      expect(inst.score).toBeGreaterThan(0);
      expect(inst.score).toBeLessThanOrEqual(1);
    }
  });

  it("caps at 5 genres even when more are available", () => {
    const manyGenresProfile: PreferenceProfile = {
      ...profileWithGenres,
      genreAffinities: [
        { genre: "Drama", avgScore: 9.0, movieCount: 20, totalComparisons: 40 },
        { genre: "Action", avgScore: 8.5, movieCount: 15, totalComparisons: 30 },
        { genre: "Thriller", avgScore: 8.0, movieCount: 12, totalComparisons: 24 },
        { genre: "Comedy", avgScore: 7.5, movieCount: 10, totalComparisons: 20 },
        { genre: "Science Fiction", avgScore: 7.0, movieCount: 8, totalComparisons: 16 },
        { genre: "Horror", avgScore: 6.5, movieCount: 6, totalComparisons: 12 },
      ],
    };
    const instances = bestInGenreShelf.generate(manyGenresProfile);
    expect(instances).toHaveLength(5);
  });

  it("skips genres not in TMDB genre map", () => {
    const profileWithUnknownGenre: PreferenceProfile = {
      ...profileWithGenres,
      genreAffinities: [
        { genre: "Drama", avgScore: 8.5, movieCount: 20, totalComparisons: 40 },
        { genre: "NotARealGenre", avgScore: 7.0, movieCount: 5, totalComparisons: 10 },
      ],
    };
    const instances = bestInGenreShelf.generate(profileWithUnknownGenre);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe("best-in-genre:drama");
  });
});

describe("bestInGenreShelf — query()", () => {
  it("calls discoverMovies with genre ID and vote_average.desc sort", async () => {
    const client = {
      discoverMovies: vi.fn().mockResolvedValue({
        results: [makeTmdbResult(201)],
        page: 1,
        totalResults: 1,
        totalPages: 1,
      }),
    } as unknown as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(client);

    const instances = bestInGenreShelf.generate(profileWithGenres);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(client.discoverMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        genreIds: [18], // Drama = 18
        sortBy: "vote_average.desc",
        voteCountGte: 50,
      })
    );
  });

  it("filters dismissed movies from results", async () => {
    const client = {
      discoverMovies: vi.fn().mockResolvedValue({
        results: [makeTmdbResult(201), makeTmdbResult(202)],
        page: 1,
        totalResults: 2,
        totalPages: 1,
      }),
    } as unknown as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(client);
    mockDismissedIds.value = new Set([201]);

    const instances = bestInGenreShelf.generate(profileWithGenres);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results.map((r) => r.tmdbId)).not.toContain(201);
    expect(results.map((r) => r.tmdbId)).toContain(202);
  });
});

// ── genre-crossover ───────────────────────────────────────────────────────────

describe("genreCrossoverShelf — definition", () => {
  it("has id genre-crossover, template true, category seed", () => {
    expect(genreCrossoverShelf.id).toBe("genre-crossover");
    expect(genreCrossoverShelf.template).toBe(true);
    expect(genreCrossoverShelf.category).toBe("seed");
  });
});

describe("genreCrossoverShelf — generate()", () => {
  it("returns empty when fewer than 2 genres in profile", () => {
    const singleGenreProfile: PreferenceProfile = {
      ...emptyProfile,
      genreAffinities: [{ genre: "Drama", avgScore: 8.0, movieCount: 10, totalComparisons: 20 }],
    };
    const instances = genreCrossoverShelf.generate(singleGenreProfile);
    expect(instances).toHaveLength(0);
  });

  it("returns at least one crossover instance for 2+ genres", () => {
    const instances = genreCrossoverShelf.generate(profileWithGenres);
    expect(instances.length).toBeGreaterThan(0);
  });

  it("shelfId is genre-crossover:{g1}-{g2}", () => {
    const instances = genreCrossoverShelf.generate(profileWithGenres);
    expect(instances[0]!.shelfId).toMatch(/^genre-crossover:/);
    const parts = instances[0]!.shelfId.split(":");
    expect(parts[1]).toContain("-");
  });

  it("title is '{G1} × {G2}'", () => {
    const instances = genreCrossoverShelf.generate(profileWithGenres);
    expect(instances[0]!.title).toMatch(/ × /);
  });

  it("excludes related genre pairs (Action + Adventure)", () => {
    const relatedProfile: PreferenceProfile = {
      ...emptyProfile,
      genreAffinities: [
        { genre: "Action", avgScore: 9.0, movieCount: 15, totalComparisons: 30 },
        { genre: "Adventure", avgScore: 8.5, movieCount: 12, totalComparisons: 24 },
      ],
    };
    const instances = genreCrossoverShelf.generate(relatedProfile);
    expect(instances).toHaveLength(0);
  });

  it("score is between 0 and 1", () => {
    const instances = genreCrossoverShelf.generate(profileWithGenres);
    for (const inst of instances) {
      expect(inst.score).toBeGreaterThan(0);
      expect(inst.score).toBeLessThanOrEqual(1);
    }
  });
});

describe("genreCrossoverShelf — query()", () => {
  it("calls discoverMovies with both genre IDs", async () => {
    const client = {
      discoverMovies: vi.fn().mockResolvedValue({
        results: [makeTmdbResult(201)],
        page: 1,
        totalResults: 1,
        totalPages: 1,
      }),
    } as unknown as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(client);

    const instances = genreCrossoverShelf.generate(profileWithGenres);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(client.discoverMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        genreIds: expect.arrayContaining([expect.any(Number), expect.any(Number)]),
        voteCountGte: 20,
      })
    );
    const callArg = vi.mocked(client.discoverMovies).mock.calls[0]?.[0];
    expect(callArg?.genreIds).toHaveLength(2);
  });

  it("filters dismissed movies", async () => {
    const client = {
      discoverMovies: vi.fn().mockResolvedValue({
        results: [makeTmdbResult(201), makeTmdbResult(202)],
        page: 1,
        totalResults: 2,
        totalPages: 1,
      }),
    } as unknown as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(client);
    mockDismissedIds.value = new Set([202]);

    const instances = genreCrossoverShelf.generate(profileWithGenres);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results.map((r) => r.tmdbId)).not.toContain(202);
  });
});

// ── top-dimension ─────────────────────────────────────────────────────────────

describe("topDimensionShelf — definition", () => {
  it("has id top-dimension, template true, category seed", () => {
    expect(topDimensionShelf.id).toBe("top-dimension");
    expect(topDimensionShelf.template).toBe(true);
    expect(topDimensionShelf.category).toBe("seed");
  });
});

describe("topDimensionShelf — generate()", () => {
  it("returns one instance per active dimension (comparisonCount >= 5)", () => {
    const instances = topDimensionShelf.generate(profileWithGenres);
    expect(instances).toHaveLength(2); // both dims have comparisonCount >= 5
  });

  it("returns empty when no dimensions meet the threshold", () => {
    const lowCountProfile: PreferenceProfile = {
      ...emptyProfile,
      dimensionWeights: [
        { dimensionId: 1, name: "Cinematography", avgScore: 1800, comparisonCount: 3 },
      ],
    };
    const instances = topDimensionShelf.generate(lowCountProfile);
    expect(instances).toHaveLength(0);
  });

  it("shelfId is top-dimension:{dimensionId}", () => {
    const instances = topDimensionShelf.generate(profileWithGenres);
    expect(instances[0]!.shelfId).toBe("top-dimension:1");
  });

  it("title is 'Top {Dimension} picks'", () => {
    const instances = topDimensionShelf.generate(profileWithGenres);
    expect(instances[0]!.title).toBe("Top Cinematography picks");
  });

  it("score is between 0 and 1", () => {
    const instances = topDimensionShelf.generate(profileWithGenres);
    for (const inst of instances) {
      expect(inst.score).toBeGreaterThan(0);
      expect(inst.score).toBeLessThanOrEqual(1);
    }
  });

  it("caps at 5 dimensions", () => {
    const manyDimsProfile: PreferenceProfile = {
      ...emptyProfile,
      dimensionWeights: Array.from({ length: 8 }, (_, i) => ({
        dimensionId: i + 1,
        name: `Dim ${i + 1}`,
        avgScore: 1600,
        comparisonCount: 10,
      })),
    };
    const instances = topDimensionShelf.generate(manyDimsProfile);
    expect(instances).toHaveLength(5);
  });
});

describe("topDimensionShelf — query()", () => {
  it("queries local DB and returns DiscoverResult[]", async () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([
        { movieId: 1, tmdbId: 101, title: "Inception", score: 1900 },
        { movieId: 2, tmdbId: 102, title: "Dunkirk", score: 1750 },
      ])
    );

    const instances = topDimensionShelf.generate(profileWithGenres);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results).toHaveLength(2);
    expect(results[0]!.tmdbId).toBe(101);
    expect(results[1]!.tmdbId).toBe(102);
  });

  it("filters dismissed movies from local results", async () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([
        { movieId: 1, tmdbId: 101, title: "Inception", score: 1900 },
        { movieId: 2, tmdbId: 102, title: "Dunkirk", score: 1750 },
      ])
    );
    mockDismissedIds.value = new Set([101]);

    const instances = topDimensionShelf.generate(profileWithGenres);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results.map((r) => r.tmdbId)).not.toContain(101);
    expect(results.map((r) => r.tmdbId)).toContain(102);
  });

  it("marks library movies with posterUrl", async () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 1, tmdbId: 101, title: "Inception", score: 1900 }])
    );
    mockLibraryIds.value = new Set([101]);

    const instances = topDimensionShelf.generate(profileWithGenres);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results[0]!.inLibrary).toBe(true);
    expect(results[0]!.posterUrl).toBe("/media/images/movie/101/poster.jpg");
  });

  it("respects offset pagination", async () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([
        { movieId: 1, tmdbId: 101, title: "Movie 1", score: 1900 },
        { movieId: 2, tmdbId: 102, title: "Movie 2", score: 1800 },
        { movieId: 3, tmdbId: 103, title: "Movie 3", score: 1700 },
      ])
    );

    const instances = topDimensionShelf.generate(profileWithGenres);
    const results = await instances[0]!.query({ limit: 2, offset: 1 });

    expect(results).toHaveLength(2);
    expect(results[0]!.tmdbId).toBe(102);
  });
});

// ── dimension-inspired ────────────────────────────────────────────────────────

describe("dimensionInspiredShelf — definition", () => {
  it("has id dimension-inspired, template true, category seed", () => {
    expect(dimensionInspiredShelf.id).toBe("dimension-inspired");
    expect(dimensionInspiredShelf.template).toBe(true);
    expect(dimensionInspiredShelf.category).toBe("seed");
  });
});

describe("dimensionInspiredShelf — generate()", () => {
  it("returns empty when no active dimensions", () => {
    const instances = dimensionInspiredShelf.generate(emptyProfile);
    expect(instances).toHaveLength(0);
  });

  it("returns one instance per active dimension (up to 3)", () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 5, tmdbId: 500, title: "Interstellar" }])
    );
    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    expect(instances).toHaveLength(2); // 2 active dims in profileWithGenres
  });

  it("shelfId is dimension-inspired:{movieId}:{dimensionId}", () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 5, tmdbId: 500, title: "Interstellar" }])
    );
    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    expect(instances[0]!.shelfId).toBe("dimension-inspired:5:1");
  });

  it("title includes movie title and dimension name", () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 5, tmdbId: 500, title: "Interstellar" }])
    );
    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    expect(instances[0]!.title).toContain("Interstellar");
    expect(instances[0]!.title).toContain("Cinematography");
  });

  it("skips dimension when no high-scoring seed movie found", () => {
    mockGetDrizzle.mockReturnValue(makeMockDb([]));
    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    expect(instances).toHaveLength(0);
  });

  it("seedMovieId matches the seed movie's id", () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 5, tmdbId: 500, title: "Interstellar" }])
    );
    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    expect(instances[0]!.seedMovieId).toBe(5);
  });

  it("score is 0.75", () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 5, tmdbId: 500, title: "Interstellar" }])
    );
    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    expect(instances[0]!.score).toBe(0.75);
  });
});

describe("dimensionInspiredShelf — query()", () => {
  it("calls getMovieRecommendations with seed tmdbId", async () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 5, tmdbId: 500, title: "Interstellar" }])
    );
    const client = {
      getMovieRecommendations: vi.fn().mockResolvedValue({
        results: [makeTmdbResult(201)],
        page: 1,
        totalResults: 1,
        totalPages: 1,
      }),
    } as unknown as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(client);

    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    await instances[0]!.query({ limit: 10, offset: 0 });

    expect(client.getMovieRecommendations).toHaveBeenCalledWith(500, 1);
  });

  it("returns scored results", async () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 5, tmdbId: 500, title: "Interstellar" }])
    );
    const client = {
      getMovieRecommendations: vi.fn().mockResolvedValue({
        results: [makeTmdbResult(201), makeTmdbResult(202)],
        page: 1,
        totalResults: 2,
        totalPages: 1,
      }),
    } as unknown as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(client);

    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results).toHaveLength(2);
  });

  it("filters dismissed movies", async () => {
    mockGetDrizzle.mockReturnValue(
      makeMockDb([{ movieId: 5, tmdbId: 500, title: "Interstellar" }])
    );
    const client = {
      getMovieRecommendations: vi.fn().mockResolvedValue({
        results: [makeTmdbResult(201), makeTmdbResult(202)],
        page: 1,
        totalResults: 2,
        totalPages: 1,
      }),
    } as unknown as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(client);
    mockDismissedIds.value = new Set([201]);

    const instances = dimensionInspiredShelf.generate(profileWithGenres);
    const results = await instances[0]!.query({ limit: 10, offset: 0 });

    expect(results.map((r) => r.tmdbId)).not.toContain(201);
    expect(results.map((r) => r.tmdbId)).toContain(202);
  });
});
