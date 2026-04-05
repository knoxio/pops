/**
 * Tests for discoveryRouter.getShelfPage (GH-1387).
 *
 * Verifies: delegation to registry + service, NOT_FOUND cases,
 * hasMore logic, template shelf ID parsing, and error handling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("./shelf/registry.js", () => ({
  getRegisteredShelves: vi.fn(() => []),
  registerShelf: vi.fn(),
  _clearRegistry: vi.fn(),
}));

vi.mock("./service.js", () => ({
  getPreferenceProfile: vi.fn(),
  getUnwatchedLibraryMovies: vi.fn(() => []),
  scoreDiscoverResults: vi.fn(() => []),
  getRewatchSuggestions: vi.fn(() => []),
  getDismissed: vi.fn(() => []),
  dismiss: vi.fn(),
  undismiss: vi.fn(),
  getQuickPickMovies: vi.fn(() => []),
}));

vi.mock("./tmdb-service.js", () => ({
  getTrending: vi.fn(),
  getRecommendations: vi.fn(),
  getWatchlistRecommendations: vi.fn(),
}));

vi.mock("./plex-service.js", () => ({
  getTrendingFromPlex: vi.fn(),
}));

vi.mock("./context-picks-service.js", () => ({
  getContextPicks: vi.fn(),
}));

vi.mock("./genre-spotlight-service.js", () => ({
  getGenreSpotlight: vi.fn(),
  getGenreSpotlightPage: vi.fn(),
}));

vi.mock("../tmdb/index.js", () => ({
  getTmdbClient: vi.fn(() => ({})),
}));

vi.mock("../../../db.js", () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    all: vi.fn(() => []),
  })),
}));

import * as registry from "./shelf/registry.js";
import * as service from "./service.js";
import { createCaller } from "../../../shared/test-utils.js";

const mockGetRegisteredShelves = vi.mocked(registry.getRegisteredShelves);
const mockGetProfile = vi.mocked(service.getPreferenceProfile);

/** Minimal PreferenceProfile stub. */
const stubProfile = {
  genreAffinities: [],
  genreDistribution: [],
  dimensionWeights: [],
  totalMoviesWatched: 0,
  totalComparisons: 0,
};

/** Build a minimal DiscoverResult stub. */
function makeItem(tmdbId: number) {
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

/** Build a mock ShelfDefinition with one instance whose query returns the given items. */
function makeDefinition(
  defId: string,
  instanceId: string,
  queryFn: (opts: { limit: number; offset: number }) => Promise<ReturnType<typeof makeItem>[]>
) {
  return {
    id: defId,
    template: false,
    category: "tmdb" as const,
    generate: vi.fn(() => [
      {
        shelfId: instanceId,
        title: `Shelf ${defId}`,
        score: 0.5,
        query: queryFn,
      },
    ]),
  };
}

let caller: ReturnType<typeof createCaller>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProfile.mockReturnValue(stubProfile);
  caller = createCaller();
});

// ---------------------------------------------------------------------------
// NOT_FOUND cases
// ---------------------------------------------------------------------------

describe("media.discovery.getShelfPage — NOT_FOUND", () => {
  it("throws NOT_FOUND when shelf definition is not in registry", async () => {
    mockGetRegisteredShelves.mockReturnValue([]);

    await expect(
      caller.media.discovery.getShelfPage({ shelfId: "unknown-shelf", limit: 10, offset: 0 })
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.media.discovery.getShelfPage({ shelfId: "unknown-shelf", limit: 10, offset: 0 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when instance shelfId does not match", async () => {
    // Definition exists but generate() returns an instance with a different shelfId
    const def = makeDefinition("some-shelf", "some-shelf:99", async () => []);
    // We ask for "some-shelf:77" — instance "some-shelf:99" won't match
    mockGetRegisteredShelves.mockReturnValue([def]);

    await expect(
      caller.media.discovery.getShelfPage({ shelfId: "some-shelf:77", limit: 10, offset: 0 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// Successful queries
// ---------------------------------------------------------------------------

describe("media.discovery.getShelfPage — results", () => {
  it("returns items and hasMore=false when fewer items than limit", async () => {
    const items = [makeItem(1), makeItem(2)];
    const def = makeDefinition("trending-tmdb", "trending-tmdb", async () => items);
    mockGetRegisteredShelves.mockReturnValue([def]);

    const result = await caller.media.discovery.getShelfPage({
      shelfId: "trending-tmdb",
      limit: 10,
      offset: 0,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.tmdbId).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(result.totalCount).toBeNull();
  });

  it("returns hasMore=true when items.length === limit", async () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem(i + 1));
    const def = makeDefinition("trending-tmdb", "trending-tmdb", async () => items);
    mockGetRegisteredShelves.mockReturnValue([def]);

    const result = await caller.media.discovery.getShelfPage({
      shelfId: "trending-tmdb",
      limit: 20,
      offset: 0,
    });

    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(20);
  });

  it("passes limit and offset through to instance.query", async () => {
    const queryFn = vi.fn().mockResolvedValue([makeItem(5)]);
    const def = makeDefinition("recommendations", "recommendations", queryFn);
    mockGetRegisteredShelves.mockReturnValue([def]);

    await caller.media.discovery.getShelfPage({
      shelfId: "recommendations",
      limit: 15,
      offset: 30,
    });

    expect(queryFn).toHaveBeenCalledWith({ limit: 15, offset: 30 });
  });

  it("calls definition.generate with current preference profile", async () => {
    const customProfile = { ...stubProfile, totalComparisons: 42 };
    mockGetProfile.mockReturnValue(customProfile);

    const def = makeDefinition("recommendations", "recommendations", async () => []);
    mockGetRegisteredShelves.mockReturnValue([def]);

    await caller.media.discovery.getShelfPage({
      shelfId: "recommendations",
      limit: 10,
      offset: 0,
    });

    expect(def.generate).toHaveBeenCalledWith(customProfile);
  });
});

// ---------------------------------------------------------------------------
// Template shelf ID parsing
// ---------------------------------------------------------------------------

describe("media.discovery.getShelfPage — template shelf ID parsing", () => {
  it("parses defId from 'because-you-watched:42' → 'because-you-watched'", async () => {
    const items = [makeItem(100)];
    const def = makeDefinition("because-you-watched", "because-you-watched:42", async () => items);
    mockGetRegisteredShelves.mockReturnValue([def]);

    const result = await caller.media.discovery.getShelfPage({
      shelfId: "because-you-watched:42",
      limit: 10,
      offset: 0,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.tmdbId).toBe(100);
  });

  it("handles static shelfId with no colon", async () => {
    const def = makeDefinition("hidden-gems", "hidden-gems", async () => [makeItem(7)]);
    mockGetRegisteredShelves.mockReturnValue([def]);

    const result = await caller.media.discovery.getShelfPage({
      shelfId: "hidden-gems",
      limit: 5,
      offset: 0,
    });

    expect(result.items[0]!.tmdbId).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("media.discovery.getShelfPage — error handling", () => {
  it("wraps query errors as INTERNAL_SERVER_ERROR", async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error("TMDB timeout"));
    const def = makeDefinition("trending-tmdb", "trending-tmdb", queryFn);
    mockGetRegisteredShelves.mockReturnValue([def]);

    await expect(
      caller.media.discovery.getShelfPage({ shelfId: "trending-tmdb", limit: 10, offset: 0 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("re-throws TRPCError from query without wrapping", async () => {
    const trpcErr = new TRPCError({ code: "NOT_FOUND", message: "custom" });
    const queryFn = vi.fn().mockRejectedValue(trpcErr);
    const def = makeDefinition("trending-tmdb", "trending-tmdb", queryFn);
    mockGetRegisteredShelves.mockReturnValue([def]);

    await expect(
      caller.media.discovery.getShelfPage({ shelfId: "trending-tmdb", limit: 10, offset: 0 })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "custom" });
  });
});
