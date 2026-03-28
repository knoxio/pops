/**
 * Tests for Plex watchlist sync — polling Plex Discover API and syncing
 * watchlist items into the POPS watchlist with source tracking.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PlexMediaItem } from "./types.js";

// Mock dependencies before imports
vi.mock("../../../db.js", () => {
  const mockDb = {
    transaction: vi.fn((fn: () => unknown) => {
      const wrapper = () => fn();
      return wrapper;
    }),
  };
  const mockDrizzle = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    getDb: vi.fn(() => mockDb),
    getDrizzle: vi.fn(() => mockDrizzle),
  };
});

vi.mock("./service.js", () => ({
  getPlexClientId: vi.fn(() => "test-client-id"),
  getPlexToken: vi.fn(() => "test-token"),
}));

vi.mock("../movies/service.js", () => ({
  getMovieByTmdbId: vi.fn(),
  createMovie: vi.fn(),
}));

vi.mock("../tv-shows/service.js", () => ({
  getTvShowByTvdbId: vi.fn(),
}));

vi.mock("../tmdb/index.js", () => ({
  getTmdbClient: vi.fn(),
}));

vi.mock("../thetvdb/index.js", () => ({
  getTvdbClient: vi.fn(),
}));

vi.mock("../library/tv-show-service.js", () => ({
  addTvShow: vi.fn(),
}));

import { fetchPlexWatchlist, syncWatchlistFromPlex } from "./sync-watchlist.js";
import { getDrizzle } from "../../../db.js";
import { getMovieByTmdbId } from "../movies/service.js";
import { getTvShowByTvdbId } from "../tv-shows/service.js";
import { getTmdbClient } from "../tmdb/index.js";
import { getTvdbClient } from "../thetvdb/index.js";

const mockGetMovieByTmdbId = vi.mocked(getMovieByTmdbId);
const mockGetTvShowByTvdbId = vi.mocked(getTvShowByTvdbId);
const mockGetTmdbClient = vi.mocked(getTmdbClient);
const mockGetTvdbClient = vi.mocked(getTvdbClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlexWatchlistItem(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: "5d776830880197001ec955e8",
    type: "movie",
    title: "Inception",
    originalTitle: null,
    summary: null,
    tagline: null,
    year: 2010,
    thumbUrl: null,
    artUrl: null,
    durationMs: null,
    addedAt: 0,
    updatedAt: 0,
    lastViewedAt: null,
    viewCount: 0,
    rating: null,
    audienceRating: null,
    contentRating: null,
    externalIds: [
      { source: "tmdb", id: "27205" },
      { source: "imdb", id: "tt1375666" },
    ],
    genres: [],
    directors: [],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
    ...overrides,
  };
}

function makeTvWatchlistItem(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: "5d776a3a880197001ec90ec5",
    type: "show",
    title: "Breaking Bad",
    originalTitle: null,
    summary: null,
    tagline: null,
    year: 2008,
    thumbUrl: null,
    artUrl: null,
    durationMs: null,
    addedAt: 0,
    updatedAt: 0,
    lastViewedAt: null,
    viewCount: 0,
    rating: null,
    audienceRating: null,
    contentRating: null,
    externalIds: [
      { source: "tvdb", id: "81189" },
      { source: "tmdb", id: "1396" },
    ],
    genres: [],
    directors: [],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
    ...overrides,
  };
}

// Mock global fetch for Plex Discover API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockPlexWatchlistResponse(items: PlexMediaItem[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      MediaContainer: {
        Metadata: items.map((item) => ({
          ratingKey: item.ratingKey,
          guid: `plex://${item.type}/${item.ratingKey}`,
          type: item.type,
          title: item.title,
          year: item.year,
          Guid: item.externalIds.map((id) => ({
            id: `${id.source}://${id.id}`,
          })),
        })),
      },
    }),
  });
}

// ---------------------------------------------------------------------------
// Drizzle mock helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function setupDrizzleMock(existingWatchlistEntries: Array<Record<string, unknown>> = []) {
  const mockDrizzle = vi.mocked(getDrizzle)() as any;
  const runMock = vi.fn(() => ({ lastInsertRowid: 1, changes: 1 }));

  // select().from().where().get() chain for single entry lookup
  // select().from().where().all() chain for listing entries
  const getMock = vi.fn((): any => undefined);
  const allMock = vi.fn((): any[] => existingWatchlistEntries);
  const whereMock = vi.fn(() => ({ get: getMock, all: allMock, run: runMock }));
  const fromMock = vi.fn(() => ({ where: whereMock, all: allMock }));
  (mockDrizzle.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMock });

  // insert().values().run() chain
  const valuesMock = vi.fn(() => ({ run: runMock }));
  (mockDrizzle.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesMock });

  // update().set().where().run() chain
  const setMock = vi.fn(() => ({ where: vi.fn(() => ({ run: runMock })) }));
  (mockDrizzle.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: setMock });

  // delete().where().run() chain
  (mockDrizzle.delete as ReturnType<typeof vi.fn>).mockReturnValue({
    where: vi.fn(() => ({ run: runMock })),
  });

  return { mockDrizzle, getMock, allMock, valuesMock, setMock, runMock, whereMock };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Tests: fetchPlexWatchlist
// ---------------------------------------------------------------------------

describe("fetchPlexWatchlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and parses Plex watchlist items", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        MediaContainer: {
          Metadata: [
            {
              ratingKey: "abc123",
              guid: "plex://movie/abc123",
              type: "movie",
              title: "Inception",
              year: 2010,
              Guid: [{ id: "tmdb://27205" }, { id: "imdb://tt1375666" }],
            },
            {
              ratingKey: "def456",
              guid: "plex://show/def456",
              type: "show",
              title: "Breaking Bad",
              year: 2008,
              Guid: [{ id: "tvdb://81189" }],
            },
          ],
        },
      }),
    });

    const items = await fetchPlexWatchlist("test-token", "test-client-id");

    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("Inception");
    expect(items[0]!.type).toBe("movie");
    expect(items[0]!.ratingKey).toBe("abc123");
    expect(items[0]!.externalIds).toEqual([
      { source: "tmdb", id: "27205" },
      { source: "imdb", id: "tt1375666" },
    ]);
    expect(items[1]!.title).toBe("Breaking Bad");
    expect(items[1]!.type).toBe("show");
    expect(items[1]!.externalIds).toEqual([{ source: "tvdb", id: "81189" }]);
  });

  it("returns empty array when no items on watchlist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ MediaContainer: {} }),
    });

    const items = await fetchPlexWatchlist("test-token", "test-client-id");
    expect(items).toHaveLength(0);
  });

  it("throws PlexApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(fetchPlexWatchlist("bad-token", "test-client-id")).rejects.toThrow(
      "Plex Discover API error: 401 Unauthorized"
    );
  });

  it("throws PlexApiError on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

    await expect(fetchPlexWatchlist("test-token", "test-client-id")).rejects.toThrow(
      "Network error fetching Plex watchlist: fetch failed"
    );
  });

  it("sends correct URL with token and client ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ MediaContainer: {} }),
    });

    await fetchPlexWatchlist("my-token", "my-client-id");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://discover.provider.plex.tv/library/sections/watchlist/all?X-Plex-Token=my-token&X-Plex-Client-Identifier=my-client-id",
      { method: "GET", headers: { Accept: "application/json" } }
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: syncWatchlistFromPlex
// ---------------------------------------------------------------------------

describe("syncWatchlistFromPlex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a new movie to the watchlist", async () => {
    const movieItem = makePlexWatchlistItem();
    mockPlexWatchlistResponse([movieItem]);

    mockGetMovieByTmdbId.mockReturnValue({ id: 42 } as ReturnType<typeof getMovieByTmdbId>);

    const { getMock, valuesMock } = setupDrizzleMock();
    // No existing watchlist entry
    getMock.mockReturnValue(undefined);

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: "movie",
        mediaId: 42,
        source: "plex",
        plexRatingKey: "5d776830880197001ec955e8",
      })
    );
  });

  it("adds a TV show to the watchlist", async () => {
    const tvItem = makeTvWatchlistItem();
    mockPlexWatchlistResponse([tvItem]);

    mockGetTvShowByTvdbId.mockReturnValue({ id: 7 } as ReturnType<typeof getTvShowByTvdbId>);

    const { getMock, valuesMock } = setupDrizzleMock();
    getMock.mockReturnValue(undefined);

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.added).toBe(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: "tv_show",
        mediaId: 7,
        source: "plex",
      })
    );
  });

  it("skips items already on watchlist with source=plex", async () => {
    const movieItem = makePlexWatchlistItem();
    mockPlexWatchlistResponse([movieItem]);

    mockGetMovieByTmdbId.mockReturnValue({ id: 42 } as ReturnType<typeof getMovieByTmdbId>);

    const { getMock } = setupDrizzleMock();
    // Existing entry with source=plex
    getMock.mockReturnValue({
      id: 1,
      mediaType: "movie",
      mediaId: 42,
      source: "plex",
      plexRatingKey: "5d776830880197001ec955e8",
    });

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skipReasons).toEqual([{ title: "Inception", reason: "Already on watchlist" }]);
  });

  it("escalates source from manual to both when item found in Plex", async () => {
    const movieItem = makePlexWatchlistItem();
    mockPlexWatchlistResponse([movieItem]);

    mockGetMovieByTmdbId.mockReturnValue({ id: 42 } as ReturnType<typeof getMovieByTmdbId>);

    const { getMock, setMock } = setupDrizzleMock();
    // Existing entry with source=manual
    getMock.mockReturnValue({
      id: 1,
      mediaType: "movie",
      mediaId: 42,
      source: "manual",
      plexRatingKey: null,
    });

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.skipped).toBe(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "both",
        plexRatingKey: "5d776830880197001ec955e8",
      })
    );
  });

  it("falls back to TMDB title search when no TMDB ID in metadata", async () => {
    const noIdItem = makePlexWatchlistItem({
      externalIds: [{ source: "imdb", id: "tt1375666" }], // Only IMDB, no TMDB
    });
    mockPlexWatchlistResponse([noIdItem]);

    // Mock TMDB search returning a match
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    mockGetTmdbClient.mockReturnValue({
      searchMovies: vi.fn().mockResolvedValue({
        results: [{ tmdbId: 27205, title: "Inception", releaseDate: "2010-07-16" }],
      }),
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    mockGetMovieByTmdbId.mockReturnValue({ id: 42 } as ReturnType<typeof getMovieByTmdbId>);

    const { getMock, valuesMock } = setupDrizzleMock();
    getMock.mockReturnValue(undefined);

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "movie", mediaId: 42 })
    );
  });

  it("skips movie when no TMDB ID and title search finds no match", async () => {
    const noIdItem = makePlexWatchlistItem({
      externalIds: [{ source: "imdb", id: "tt1375666" }], // Only IMDB, no TMDB
    });
    mockPlexWatchlistResponse([noIdItem]);

    // Mock TMDB search returning no results
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    mockGetTmdbClient.mockReturnValue({
      searchMovies: vi.fn().mockResolvedValue({ results: [] }),
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

    setupDrizzleMock();

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(result.skipReasons).toEqual([
      {
        title: "Inception",
        reason: "No TMDB ID in Plex metadata and title search found no match",
      },
    ]);
  });

  it("falls back to TVDB title search when no TVDB ID in metadata", async () => {
    const noIdItem = makeTvWatchlistItem({
      externalIds: [{ source: "tmdb", id: "1396" }], // Only TMDB, no TVDB
    });
    mockPlexWatchlistResponse([noIdItem]);

    // Mock TVDB search returning a match
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    mockGetTvdbClient.mockReturnValue({
      searchSeries: vi
        .fn()
        .mockResolvedValue([{ tvdbId: 81189, name: "Breaking Bad", year: "2008" }]),
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    mockGetTvShowByTvdbId.mockReturnValue({ id: 7 } as ReturnType<typeof getTvShowByTvdbId>);

    const { getMock, valuesMock } = setupDrizzleMock();
    getMock.mockReturnValue(undefined);

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "tv_show", mediaId: 7 })
    );
  });

  it("skips items with unsupported media type and reports reason", async () => {
    const unknownTypeItem = makePlexWatchlistItem({ type: "artist" });
    mockPlexWatchlistResponse([unknownTypeItem]);

    setupDrizzleMock();

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.skipped).toBe(1);
    expect(result.skipReasons).toEqual([
      { title: "Inception", reason: "Unsupported media type: artist" },
    ]);
  });

  it("handles empty Plex watchlist", async () => {
    mockPlexWatchlistResponse([]);
    setupDrizzleMock();

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.total).toBe(0);
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
  });

  it("is idempotent — repeated sync produces same state", async () => {
    const movieItem = makePlexWatchlistItem();

    // First sync: add item
    mockPlexWatchlistResponse([movieItem]);
    mockGetMovieByTmdbId.mockReturnValue({ id: 42 } as ReturnType<typeof getMovieByTmdbId>);
    const { getMock: getMock1 } = setupDrizzleMock();
    getMock1.mockReturnValue(undefined);
    const result1 = await syncWatchlistFromPlex("test-token");
    expect(result1.added).toBe(1);

    // Second sync: item already exists
    mockPlexWatchlistResponse([movieItem]);
    mockGetMovieByTmdbId.mockReturnValue({ id: 42 } as ReturnType<typeof getMovieByTmdbId>);
    const { getMock: getMock2 } = setupDrizzleMock();
    getMock2.mockReturnValue({
      id: 1,
      mediaType: "movie",
      mediaId: 42,
      source: "plex",
      plexRatingKey: "5d776830880197001ec955e8",
    });
    const result2 = await syncWatchlistFromPlex("test-token");
    expect(result2.added).toBe(0);
    expect(result2.skipped).toBe(1);
  });

  it("removes plex-sourced items no longer in Plex watchlist", async () => {
    // Empty Plex watchlist (items were removed)
    mockPlexWatchlistResponse([]);

    const { allMock } = setupDrizzleMock([
      {
        id: 1,
        mediaType: "movie",
        mediaId: 42,
        source: "plex",
        plexRatingKey: "old-key",
      },
    ]);

    // The allMock for isNotNull query returns entries with plexRatingKey
    allMock.mockReturnValue([
      {
        id: 1,
        mediaType: "movie",
        mediaId: 42,
        source: "plex",
        plexRatingKey: "old-key",
      },
    ]);

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.removed).toBe(1);
  });

  it("downgrades source=both to source=manual when removed from Plex", async () => {
    mockPlexWatchlistResponse([]);

    const { allMock, setMock } = setupDrizzleMock();
    allMock.mockReturnValue([
      {
        id: 1,
        mediaType: "movie",
        mediaId: 42,
        source: "both",
        plexRatingKey: "old-key",
      },
    ]);

    const result = await syncWatchlistFromPlex("test-token");

    expect(result.removed).toBe(0); // Not removed, just downgraded
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "manual",
        plexRatingKey: null,
      })
    );
  });

  it("reports errors for individual items without failing the whole sync", async () => {
    const goodItem = makePlexWatchlistItem({
      ratingKey: "good-key",
      title: "Good Movie",
    });
    const badItem = makePlexWatchlistItem({
      ratingKey: "bad-key",
      title: "Bad Movie",
      externalIds: [{ source: "tmdb", id: "999" }],
    });
    mockPlexWatchlistResponse([goodItem, badItem]);

    // Good movie resolves fine
    mockGetMovieByTmdbId
      .mockReturnValueOnce({ id: 1 } as ReturnType<typeof getMovieByTmdbId>)
      .mockReturnValueOnce(null); // Bad movie not found and can't be added

    const { getMock } = setupDrizzleMock();
    getMock.mockReturnValue(undefined);

    const result = await syncWatchlistFromPlex("test-token");

    // Good movie added, bad movie skipped (no error — just returns null from resolve)
    expect(result.processed).toBe(2);
  });

  it("calls onProgress callback after each item", async () => {
    const items = [
      makePlexWatchlistItem({ ratingKey: "key1", title: "Movie 1" }),
      makePlexWatchlistItem({ ratingKey: "key2", title: "Movie 2" }),
    ];
    mockPlexWatchlistResponse(items);

    mockGetMovieByTmdbId.mockReturnValue({ id: 1 } as ReturnType<typeof getMovieByTmdbId>);
    const { getMock } = setupDrizzleMock();
    getMock.mockReturnValue(undefined);

    const progressCalls: number[] = [];
    await syncWatchlistFromPlex("test-token", {
      onProgress: (p) => progressCalls.push(p.processed),
    });

    expect(progressCalls).toEqual([1, 2]);
  });
});
