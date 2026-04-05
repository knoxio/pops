/**
 * Tests for context-shelves.ts (GH-1473).
 *
 * Verifies: trigger-based activation, inactive shelves return no instances,
 * query delegates to discoverMovies, dismissed filter applied, shelfId format.
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
import { contextShelves } from "./context-shelves.js";

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
// Module load: all collections registered
// ---------------------------------------------------------------------------

describe("contextShelves — module load", () => {
  it("registers all 7 shelves on module load", () => {
    expect(registrationCallCount).toBe(7);
  });

  it("exports one shelf per ContextCollection (7 total)", () => {
    expect(contextShelves).toHaveLength(7);
  });

  it("all shelves have category=context", () => {
    for (const shelf of contextShelves) {
      expect(shelf.category).toBe("context");
    }
  });

  it("all shelves have template=true", () => {
    for (const shelf of contextShelves) {
      expect(shelf.template).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// date-night: active Friday/Saturday evening 18-22
// ---------------------------------------------------------------------------

describe("date-night shelf", () => {
  const shelf = contextShelves.find((s) => s.id === "date-night")!;

  it("generates 1 instance on Friday at 19:00", () => {
    // Mock Date to Friday (day=5) at 19:00 in October (month=10)
    vi.setSystemTime(new Date("2024-10-18T19:00:00")); // Friday, Oct 18
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe("context:date-night");
    vi.useRealTimers();
  });

  it("generates 1 instance on Saturday at 20:00", () => {
    vi.setSystemTime(new Date("2024-10-19T20:00:00")); // Saturday, Oct 19
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    vi.useRealTimers();
  });

  it("generates no instances on Sunday at 19:00", () => {
    vi.setSystemTime(new Date("2024-10-20T19:00:00")); // Sunday, Oct 20
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(0);
    vi.useRealTimers();
  });

  it("generates no instances on Friday at 10:00 (morning)", () => {
    vi.setSystemTime(new Date("2024-10-18T10:00:00")); // Friday morning
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(0);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// sunday-flicks: active on Sunday
// ---------------------------------------------------------------------------

describe("sunday-flicks shelf", () => {
  const shelf = contextShelves.find((s) => s.id === "sunday-flicks")!;

  it("generates 1 instance on Sunday", () => {
    vi.setSystemTime(new Date("2024-10-20T14:00:00")); // Sunday
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe("context:sunday-flicks");
    vi.useRealTimers();
  });

  it("generates no instances on Monday", () => {
    vi.setSystemTime(new Date("2024-10-21T14:00:00")); // Monday
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(0);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// late-night: active at 22:00+ or ≤02:00
// ---------------------------------------------------------------------------

describe("late-night shelf", () => {
  const shelf = contextShelves.find((s) => s.id === "late-night")!;

  it("generates 1 instance at 23:00", () => {
    vi.setSystemTime(new Date("2024-10-21T23:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe("context:late-night");
    vi.useRealTimers();
  });

  it("generates 1 instance at 01:00", () => {
    vi.setSystemTime(new Date("2024-10-21T01:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    vi.useRealTimers();
  });

  it("generates no instances at 15:00", () => {
    vi.setSystemTime(new Date("2024-10-21T15:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(0);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// halloween: active in October
// ---------------------------------------------------------------------------

describe("halloween shelf", () => {
  const shelf = contextShelves.find((s) => s.id === "halloween")!;

  it("generates 1 instance in October", () => {
    vi.setSystemTime(new Date("2024-10-15T12:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe("context:halloween");
    vi.useRealTimers();
  });

  it("generates no instances in November", () => {
    vi.setSystemTime(new Date("2024-11-01T12:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(0);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// christmas: active in December
// ---------------------------------------------------------------------------

describe("christmas shelf", () => {
  const shelf = contextShelves.find((s) => s.id === "christmas")!;

  it("generates 1 instance in December", () => {
    vi.setSystemTime(new Date("2024-12-10T12:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe("context:christmas");
    vi.useRealTimers();
  });

  it("generates no instances in January", () => {
    vi.setSystemTime(new Date("2024-01-10T12:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(0);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// oscar-season: active in February and March
// ---------------------------------------------------------------------------

describe("oscar-season shelf", () => {
  const shelf = contextShelves.find((s) => s.id === "oscar-season")!;

  it("generates 1 instance in February", () => {
    vi.setSystemTime(new Date("2025-02-15T12:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe("context:oscar-season");
    vi.useRealTimers();
  });

  it("generates 1 instance in March", () => {
    vi.setSystemTime(new Date("2025-03-01T12:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    vi.useRealTimers();
  });

  it("generates no instances in April", () => {
    vi.setSystemTime(new Date("2025-04-01T12:00:00"));
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(0);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// rainy-day: always active (fallback)
// ---------------------------------------------------------------------------

describe("rainy-day shelf", () => {
  const shelf = contextShelves.find((s) => s.id === "rainy-day")!;

  it("generates 1 instance at any time", () => {
    const instances = shelf.generate(stubProfile);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.shelfId).toBe("context:rainy-day");
  });

  it("has lower score than regular context shelves (fallback score)", () => {
    const instances = shelf.generate(stubProfile);
    const regularShelf = contextShelves.find((s) => s.id === "date-night")!;
    // We need date-night active to compare
    vi.setSystemTime(new Date("2024-10-18T19:00:00")); // Friday evening
    const dateNightInstances = regularShelf.generate(stubProfile);
    expect(instances[0]!.score).toBeLessThan(dateNightInstances[0]!.score);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Query delegation
// ---------------------------------------------------------------------------

describe("contextShelves query()", () => {
  it("calls discoverMovies with correct genre and keyword IDs", async () => {
    const discoverMoviesMock = vi.fn().mockResolvedValue(makeTmdbResponse(5));
    mockGetTmdbClient.mockReturnValue({
      discoverMovies: discoverMoviesMock,
    } as unknown as ReturnType<typeof getTmdbClient>);

    vi.setSystemTime(new Date("2024-10-15T12:00:00")); // October → halloween
    const halloweenShelf = contextShelves.find((s) => s.id === "halloween")!;
    const [instance] = halloweenShelf.generate(stubProfile);
    await instance!.query({ limit: 10, offset: 0 });

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

    const shelf = contextShelves.find((s) => s.id === "rainy-day")!;
    const [instance] = shelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });

    expect(out).toHaveLength(1);
    expect(out[0]!.tmdbId).toBe(2);
  });

  it("applies offset/limit with TMDB page calculation", async () => {
    const discoverMoviesMock = vi.fn().mockResolvedValue(makeTmdbResponse(20));
    mockGetTmdbClient.mockReturnValue({
      discoverMovies: discoverMoviesMock,
    } as unknown as ReturnType<typeof getTmdbClient>);
    mockToDiscoverResults.mockReturnValue(Array.from({ length: 20 }, (_, i) => makeResult(i + 1)));

    const shelf = contextShelves.find((s) => s.id === "rainy-day")!;
    const [instance] = shelf.generate(stubProfile);
    const out = await instance!.query({ limit: 5, offset: 10 });

    // page = floor(10/20) + 1 = 1
    expect(discoverMoviesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    // start = 10 % 20 = 10, returns slice(10, 15)
    expect(out).toHaveLength(5);
    expect(out[0]!.tmdbId).toBe(11);
  });
});
