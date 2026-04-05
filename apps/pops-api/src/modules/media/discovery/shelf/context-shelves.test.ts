/**
 * Tests for context-shelves.ts (GH-1477).
 *
 * Verifies: single "context" definition, trigger-based activation per collection,
 * inactive collections return no instance, query delegates to discoverMovies,
 * dismissed filter applied, shelfId format enables getShelfPage pagination.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before any imports
vi.mock("../../tmdb/index.js", () => ({ getTmdbClient: vi.fn() }));
vi.mock("../tmdb-service.js", () => ({
  getLibraryTmdbIds: vi.fn().mockReturnValue(new Set()),
  toDiscoverResults: vi.fn().mockReturnValue([]),
}));
vi.mock("../flags.js", () => ({
  getDismissedTmdbIds: vi.fn().mockReturnValue(new Set()),
  getWatchedTmdbIds: vi.fn().mockReturnValue(new Set()),
  getWatchlistTmdbIds: vi.fn().mockReturnValue(new Set()),
}));
vi.mock("./registry.js", () => ({ registerShelf: vi.fn() }));

import { getTmdbClient } from "../../tmdb/index.js";
import * as tmdbService from "../tmdb-service.js";
import * as flags from "../flags.js";
import { registerShelf } from "./registry.js";

// Import module under test — triggers self-registration side effects
import { contextShelfDefinition } from "./context-shelves.js";

const mockGetTmdbClient = vi.mocked(getTmdbClient);
const mockToDiscoverResults = vi.mocked(tmdbService.toDiscoverResults);
const mockGetLibraryTmdbIds = vi.mocked(tmdbService.getLibraryTmdbIds);
const mockGetDismissedTmdbIds = vi.mocked(flags.getDismissedTmdbIds);
const mockGetWatchedTmdbIds = vi.mocked(flags.getWatchedTmdbIds);
const mockGetWatchlistTmdbIds = vi.mocked(flags.getWatchlistTmdbIds);
const mockRegisterShelf = vi.mocked(registerShelf);
// Capture registration count at module load — before beforeEach clears mock history
const registrationCallCount = mockRegisterShelf.mock.calls.length;

const stubProfile = {
  genreAffinities: [],
  genreDistribution: [],
  dimensionWeights: [],
  totalMoviesWatched: 0,
  totalComparisons: 0,
};

/** Minimal DiscoverResult stub. */
function makeResult(tmdbId: number) {
  return {
    tmdbId,
    title: `Movie ${tmdbId}`,
    overview: "",
    releaseDate: "2024-01-01",
    posterPath: null,
    posterUrl: null,
    backdropPath: null,
    voteAverage: 7.0,
    voteCount: 100,
    genreIds: [],
    popularity: 50,
    inLibrary: false,
    isWatched: false,
    onWatchlist: false,
  };
}

/** Minimal discoverMovies response. */
function makeTmdbResponse(count = 2) {
  return {
    page: 1,
    totalResults: count,
    totalPages: 1,
    results: Array.from({ length: count }, (_, i) => ({
      tmdbId: i + 1,
      title: `Movie ${i + 1}`,
      overview: "",
      releaseDate: "2024-01-01",
      posterPath: null,
      backdropPath: null,
      voteAverage: 7.0,
      voteCount: 100,
      genreIds: [],
      popularity: 50,
      originalLanguage: "en",
      adult: false,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTmdbClient.mockReturnValue({
    discoverMovies: vi.fn().mockResolvedValue(makeTmdbResponse()),
  } as unknown as ReturnType<typeof getTmdbClient>);
  mockToDiscoverResults.mockReturnValue([makeResult(1), makeResult(2)]);
  mockGetLibraryTmdbIds.mockReturnValue(new Set());
  mockGetDismissedTmdbIds.mockReturnValue(new Set());
  mockGetWatchedTmdbIds.mockReturnValue(new Set());
  mockGetWatchlistTmdbIds.mockReturnValue(new Set());
});

// ---------------------------------------------------------------------------
// Module load: single "context" definition registered
// ---------------------------------------------------------------------------

describe("contextShelfDefinition — module load", () => {
  it("registers 1 shelf definition on module load", () => {
    expect(registrationCallCount).toBe(1);
  });

  it("has id='context'", () => {
    expect(contextShelfDefinition.id).toBe("context");
  });

  it("has category=context", () => {
    expect(contextShelfDefinition.category).toBe("context");
  });

  it("has template=true", () => {
    expect(contextShelfDefinition.template).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// date-night: active Friday/Saturday evening 18-22
// ---------------------------------------------------------------------------

describe("date-night instance", () => {
  it("generates instance on Friday at 19:00", () => {
    vi.setSystemTime(new Date("2024-10-18T19:00:00")); // Friday, Oct 18
    const instances = contextShelfDefinition.generate(stubProfile);
    const instance = instances.find((i) => i.shelfId === "context:date-night");
    expect(instance).toBeDefined();
    expect(instance!.shelfId).toBe("context:date-night");
    vi.useRealTimers();
  });

  it("generates instance on Saturday at 20:00", () => {
    vi.setSystemTime(new Date("2024-10-19T20:00:00")); // Saturday, Oct 19
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:date-night")).toBeDefined();
    vi.useRealTimers();
  });

  it("does not generate instance on Sunday at 19:00", () => {
    vi.setSystemTime(new Date("2024-10-20T19:00:00")); // Sunday, Oct 20
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:date-night")).toBeUndefined();
    vi.useRealTimers();
  });

  it("does not generate instance on Friday at 10:00 (morning)", () => {
    vi.setSystemTime(new Date("2024-10-18T10:00:00")); // Friday morning
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:date-night")).toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// sunday-flicks: active on Sunday
// ---------------------------------------------------------------------------

describe("sunday-flicks instance", () => {
  it("generates instance on Sunday", () => {
    vi.setSystemTime(new Date("2024-10-20T14:00:00")); // Sunday
    const instances = contextShelfDefinition.generate(stubProfile);
    const instance = instances.find((i) => i.shelfId === "context:sunday-flicks");
    expect(instance).toBeDefined();
    expect(instance!.shelfId).toBe("context:sunday-flicks");
    vi.useRealTimers();
  });

  it("does not generate instance on Monday", () => {
    vi.setSystemTime(new Date("2024-10-21T14:00:00")); // Monday
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:sunday-flicks")).toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// late-night: active at 22:00+ or ≤02:00
// ---------------------------------------------------------------------------

describe("late-night instance", () => {
  it("generates instance at 23:00", () => {
    vi.setSystemTime(new Date("2024-10-21T23:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    const instance = instances.find((i) => i.shelfId === "context:late-night");
    expect(instance).toBeDefined();
    expect(instance!.shelfId).toBe("context:late-night");
    vi.useRealTimers();
  });

  it("generates instance at 01:00", () => {
    vi.setSystemTime(new Date("2024-10-21T01:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:late-night")).toBeDefined();
    vi.useRealTimers();
  });

  it("does not generate instance at 15:00", () => {
    vi.setSystemTime(new Date("2024-10-21T15:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:late-night")).toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// halloween: active in October
// ---------------------------------------------------------------------------

describe("halloween instance", () => {
  it("generates instance in October", () => {
    vi.setSystemTime(new Date("2024-10-15T12:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    const instance = instances.find((i) => i.shelfId === "context:halloween");
    expect(instance).toBeDefined();
    expect(instance!.shelfId).toBe("context:halloween");
    vi.useRealTimers();
  });

  it("does not generate instance in November", () => {
    vi.setSystemTime(new Date("2024-11-01T12:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:halloween")).toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// christmas: active in December
// ---------------------------------------------------------------------------

describe("christmas instance", () => {
  it("generates instance in December", () => {
    vi.setSystemTime(new Date("2024-12-10T12:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    const instance = instances.find((i) => i.shelfId === "context:christmas");
    expect(instance).toBeDefined();
    expect(instance!.shelfId).toBe("context:christmas");
    vi.useRealTimers();
  });

  it("does not generate instance in January", () => {
    vi.setSystemTime(new Date("2024-01-10T12:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:christmas")).toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// oscar-season: active in February and March
// ---------------------------------------------------------------------------

describe("oscar-season instance", () => {
  it("generates instance in February", () => {
    vi.setSystemTime(new Date("2025-02-15T12:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    const instance = instances.find((i) => i.shelfId === "context:oscar-season");
    expect(instance).toBeDefined();
    expect(instance!.shelfId).toBe("context:oscar-season");
    vi.useRealTimers();
  });

  it("generates instance in March", () => {
    vi.setSystemTime(new Date("2025-03-01T12:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:oscar-season")).toBeDefined();
    vi.useRealTimers();
  });

  it("does not generate instance in April", () => {
    vi.setSystemTime(new Date("2025-04-01T12:00:00"));
    const instances = contextShelfDefinition.generate(stubProfile);
    expect(instances.find((i) => i.shelfId === "context:oscar-season")).toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// rainy-day: always active (fallback)
// ---------------------------------------------------------------------------

describe("rainy-day instance", () => {
  it("generates instance at any time", () => {
    const instances = contextShelfDefinition.generate(stubProfile);
    const instance = instances.find((i) => i.shelfId === "context:rainy-day");
    expect(instance).toBeDefined();
    expect(instance!.shelfId).toBe("context:rainy-day");
  });

  it("has lower score than time-triggered context instances (fallback score)", () => {
    vi.setSystemTime(new Date("2024-10-18T19:00:00")); // Friday evening → date-night active
    const instances = contextShelfDefinition.generate(stubProfile);
    const rainyDay = instances.find((i) => i.shelfId === "context:rainy-day");
    const dateNight = instances.find((i) => i.shelfId === "context:date-night");
    expect(rainyDay).toBeDefined();
    expect(dateNight).toBeDefined();
    expect(rainyDay!.score).toBeLessThan(dateNight!.score);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Query delegation
// ---------------------------------------------------------------------------

describe("contextShelfDefinition query()", () => {
  it("calls discoverMovies with correct genre and keyword IDs", async () => {
    const discoverMoviesMock = vi.fn().mockResolvedValue(makeTmdbResponse(5));
    mockGetTmdbClient.mockReturnValue({
      discoverMovies: discoverMoviesMock,
    } as unknown as ReturnType<typeof getTmdbClient>);

    vi.setSystemTime(new Date("2024-10-15T12:00:00")); // October → halloween
    const instances = contextShelfDefinition.generate(stubProfile);
    const halloweenInstance = instances.find((i) => i.shelfId === "context:halloween");
    await halloweenInstance!.query({ limit: 10, offset: 0 });

    expect(discoverMoviesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        genreIds: [27], // Horror
        keywordIds: [3335], // halloween keyword
        sortBy: "vote_average.desc",
        voteCountGte: 100,
      })
    );
    vi.useRealTimers();
  });

  it("filters dismissed movies from results", async () => {
    const result1 = makeResult(1);
    const result2 = makeResult(2);
    mockToDiscoverResults.mockReturnValue([result1, result2]);
    mockGetDismissedTmdbIds.mockReturnValue(new Set([1])); // dismiss tmdbId 1

    const instances = contextShelfDefinition.generate(stubProfile);
    const rainyDay = instances.find((i) => i.shelfId === "context:rainy-day");
    const out = await rainyDay!.query({ limit: 10, offset: 0 });

    expect(out).toHaveLength(1);
    expect(out[0]!.tmdbId).toBe(2);
  });

  it("applies offset/limit with TMDB page calculation", async () => {
    const discoverMoviesMock = vi.fn().mockResolvedValue(makeTmdbResponse(20));
    mockGetTmdbClient.mockReturnValue({
      discoverMovies: discoverMoviesMock,
    } as unknown as ReturnType<typeof getTmdbClient>);
    mockToDiscoverResults.mockReturnValue(Array.from({ length: 20 }, (_, i) => makeResult(i + 1)));

    const instances = contextShelfDefinition.generate(stubProfile);
    const rainyDay = instances.find((i) => i.shelfId === "context:rainy-day");
    const out = await rainyDay!.query({ limit: 5, offset: 10 });

    // page = floor(10/20) + 1 = 1
    expect(discoverMoviesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    // start = 10 % 20 = 10, returns slice(10, 15)
    expect(out).toHaveLength(5);
    expect(out[0]!.tmdbId).toBe(11);
  });

  it("shelfId format enables getShelfPage resolution (context:* splits to defId='context')", () => {
    const instances = contextShelfDefinition.generate(stubProfile);
    for (const instance of instances) {
      const defId = instance.shelfId.split(":")[0];
      expect(defId).toBe("context");
    }
  });
});
