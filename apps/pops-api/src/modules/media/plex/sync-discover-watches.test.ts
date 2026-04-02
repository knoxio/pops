/**
 * Tests for Plex Discover cloud watch sync (GraphQL activity feed approach).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

// Mock dependencies
vi.mock("../watch-history/service.js", () => ({
  logWatch: vi.fn(),
}));

vi.mock("../../../db.js", () => ({
  getDrizzle: vi.fn(),
}));

vi.mock("./service.js", () => ({
  getPlexToken: vi.fn(),
  getPlexClientId: vi.fn(),
}));

vi.mock("./sync-helpers.js", () => ({
  findDiscoverMatch: vi.fn(),
}));

vi.mock("@pops/db-types", () => ({
  movies: {
    id: "id",
    title: "title",
    tmdbId: "tmdb_id",
    discoverRatingKey: "discover_rating_key",
  },
  tvShows: {
    id: "id",
    name: "name",
    tvdbId: "tvdb_id",
    discoverRatingKey: "discover_rating_key",
  },
}));

import { syncDiscoverWatches, checkAndLogMovieWatch } from "./sync-discover-watches.js";
import { logWatch } from "../watch-history/service.js";
import { getDrizzle } from "../../../db.js";
import { getPlexToken, getPlexClientId } from "./service.js";
import { findDiscoverMatch } from "./sync-helpers.js";
import type { PlexClient } from "./client.js";
import type { PlexMediaItem } from "./types.js";

const mockLogWatch = vi.mocked(logWatch);
const mockGetDrizzle = vi.mocked(getDrizzle);
const mockGetPlexToken = vi.mocked(getPlexToken);
const mockGetPlexClientId = vi.mocked(getPlexClientId);
const mockFindDiscoverMatch = vi.mocked(findDiscoverMatch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal logWatch return that satisfies the real signature. */
function logWatchResult(created: boolean): ReturnType<typeof logWatch> {
  return {
    entry: {
      id: 1,
      mediaType: "movie",
      mediaId: 1,
      watchedAt: "2026-01-01T00:00:00.000Z",
      completed: 1,
    },
    created,
    watchlistRemoved: false,
  };
}

function setupDrizzleMock(
  movieRows: Array<{
    id: number;
    title: string;
    tmdbId: number;
    discoverRatingKey: string | null;
  }> = [],
  showRows: Array<{
    id: number;
    name: string;
    tvdbId: number;
    discoverRatingKey: string | null;
  }> = []
): void {
  const mockAll = vi.fn().mockReturnValueOnce(movieRows).mockReturnValueOnce(showRows);
  const mockFrom = vi.fn().mockReturnValue({ all: mockAll });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  const mockRun = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ run: mockRun });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
  mockGetDrizzle.mockReturnValue({
    select: mockSelect,
    update: mockUpdate,
  } as unknown as BetterSQLite3Database);
}

function makePlexClient(overrides: Partial<PlexClient> = {}): PlexClient {
  return {
    searchDiscover: vi.fn().mockResolvedValue([] as PlexMediaItem[]),
    getUserState: vi.fn().mockResolvedValue(null),
    getDiscoverMetadata: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as PlexClient;
}

function mockFetchResponses(responses: Array<{ url: string; body: unknown }>): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (const r of responses) {
      if (url.includes(r.url)) {
        return new Response(JSON.stringify(r.body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("Not found", { status: 404 });
  });
}

function graphqlWatchHistoryResponse(
  nodes: Array<{
    id: string;
    date: string;
    metadataId: string;
    title: string;
    type?: string;
  }>,
  hasNextPage = false
): { url: string; body: unknown } {
  return {
    url: "community.plex.tv/api",
    body: {
      data: {
        user: {
          watchHistory: {
            nodes: nodes.map((n) => ({
              id: n.id,
              date: n.date,
              metadataItem: {
                id: n.metadataId,
                title: n.title,
                type: n.type ?? "MOVIE",
                index: 0,
                year: 2001,
                parent: null,
                grandparent: null,
              },
            })),
            pageInfo: { hasNextPage, endCursor: hasNextPage ? "cursor-1" : null },
          },
        },
      },
    },
  };
}

const PLEX_USER_RESPONSE = { url: "plex.tv/api/v2/user", body: { uuid: "user-uuid-123" } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  mockGetPlexToken.mockReturnValue("test-token");
  mockGetPlexClientId.mockReturnValue("test-client-id");
});

describe("syncDiscoverWatches (GraphQL)", () => {
  it("logs watch entries from activity feed matching library movies", async () => {
    setupDrizzleMock([{ id: 1, title: "Shrek", tmdbId: 808, discoverRatingKey: "abc-123" }], []);
    mockLogWatch.mockReturnValue(logWatchResult(true));

    mockFetchResponses([
      PLEX_USER_RESPONSE,
      graphqlWatchHistoryResponse([
        { id: "event-1", date: "2026-03-02T09:28:32.000Z", metadataId: "abc-123", title: "Shrek" },
        {
          id: "event-2",
          date: "2025-01-02T08:27:07.000Z",
          metadataId: "abc-123",
          title: "Shrek",
        },
      ]),
    ]);

    const client = makePlexClient();
    const result = await syncDiscoverWatches(client);

    expect(result.movies.watched).toBe(2);
    expect(result.movies.logged).toBe(2);
    expect(mockLogWatch).toHaveBeenCalledTimes(2);
    expect(mockLogWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: "movie",
        mediaId: 1,
        watchedAt: "2026-03-02T09:28:32.000Z",
        source: "plex_sync",
      })
    );
    expect(mockLogWatch).toHaveBeenCalledWith(
      expect.objectContaining({ watchedAt: "2025-01-02T08:27:07.000Z" })
    );
  });

  it("counts already-logged movies correctly", async () => {
    setupDrizzleMock([{ id: 1, title: "Shrek", tmdbId: 808, discoverRatingKey: "abc-123" }], []);
    mockLogWatch.mockReturnValue(logWatchResult(false));

    mockFetchResponses([
      PLEX_USER_RESPONSE,
      graphqlWatchHistoryResponse([
        { id: "event-1", date: "2026-03-02T09:28:32.000Z", metadataId: "abc-123", title: "Shrek" },
      ]),
    ]);

    const client = makePlexClient();
    const result = await syncDiscoverWatches(client);

    expect(result.movies.watched).toBe(1);
    expect(result.movies.alreadyLogged).toBe(1);
    expect(result.movies.logged).toBe(0);
  });

  it("skips entries not in POPS library", async () => {
    setupDrizzleMock([{ id: 1, title: "Shrek", tmdbId: 808, discoverRatingKey: "abc-123" }], []);

    mockFetchResponses([
      PLEX_USER_RESPONSE,
      graphqlWatchHistoryResponse([
        {
          id: "event-1",
          date: "2026-03-02T09:28:32.000Z",
          metadataId: "unknown-key",
          title: "Unknown Movie",
        },
      ]),
    ]);

    const client = makePlexClient();
    const result = await syncDiscoverWatches(client);

    expect(result.movies.watched).toBe(0);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it("handles empty watch history", async () => {
    setupDrizzleMock([], []);

    mockFetchResponses([PLEX_USER_RESPONSE, graphqlWatchHistoryResponse([])]);

    const client = makePlexClient();
    const result = await syncDiscoverWatches(client);

    expect(result.movies.total).toBe(0);
    expect(result.tvShows.total).toBe(0);
  });

  it("reports progress during pagination", async () => {
    setupDrizzleMock([{ id: 1, title: "Shrek", tmdbId: 808, discoverRatingKey: "abc-123" }], []);
    mockLogWatch.mockReturnValue(logWatchResult(true));

    mockFetchResponses([
      PLEX_USER_RESPONSE,
      graphqlWatchHistoryResponse([
        { id: "event-1", date: "2026-03-02T09:28:32.000Z", metadataId: "abc-123", title: "Shrek" },
      ]),
    ]);

    const progressCalls: Array<[number, number]> = [];
    const client = makePlexClient();
    await syncDiscoverWatches(client, (processed, total) => progressCalls.push([processed, total]));

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[0]?.[0]).toBe(1);
  });

  it("reports TV shows total but does not process them (cloud API limitation)", async () => {
    setupDrizzleMock(
      [],
      [{ id: 1, name: "Breaking Bad", tvdbId: 81189, discoverRatingKey: "tv-key" }]
    );

    mockFetchResponses([PLEX_USER_RESPONSE, graphqlWatchHistoryResponse([])]);

    const client = makePlexClient();
    const result = await syncDiscoverWatches(client);

    expect(result.tvShows.total).toBe(1);
    expect(result.tvShows.watched).toBe(0);
    expect(result.tvShows.logged).toBe(0);
  });
});

describe("checkAndLogMovieWatch", () => {
  it("logs individual watch dates from activity feed", async () => {
    setupDrizzleMock([{ id: 670, title: "Shrek", tmdbId: 808, discoverRatingKey: null }], []);
    mockLogWatch.mockReturnValue(logWatchResult(true));
    mockFindDiscoverMatch.mockResolvedValue("disc-key-123");

    const searchResult = { ratingKey: "disc-key-123" } as PlexMediaItem;
    const client = makePlexClient({
      searchDiscover: vi.fn().mockResolvedValue([searchResult]),
      getUserState: vi.fn().mockResolvedValue({ viewCount: 3, lastViewedAt: 1772443712 }),
    });

    mockFetchResponses([
      PLEX_USER_RESPONSE,
      {
        url: "community.plex.tv/api",
        body: {
          data: {
            activityFeed: {
              nodes: [
                { date: "2026-03-02T09:28:32.000Z" },
                { date: "2026-02-27T11:24:45.000Z" },
                { date: "2025-01-02T08:27:07.000Z" },
              ],
            },
          },
        },
      },
    ]);

    const result = await checkAndLogMovieWatch(client, 670, "Shrek", 808);

    expect(result).toBe(true);
    expect(mockLogWatch).toHaveBeenCalledTimes(3);
    expect(mockLogWatch).toHaveBeenCalledWith(
      expect.objectContaining({ watchedAt: "2026-03-02T09:28:32.000Z" })
    );
    expect(mockLogWatch).toHaveBeenCalledWith(
      expect.objectContaining({ watchedAt: "2025-01-02T08:27:07.000Z" })
    );
  });

  it("falls back to userState when activity feed is empty", async () => {
    setupDrizzleMock([{ id: 670, title: "Shrek", tmdbId: 808, discoverRatingKey: null }], []);
    mockLogWatch.mockReturnValue(logWatchResult(true));
    mockFindDiscoverMatch.mockResolvedValue("disc-key-123");

    const searchResult = { ratingKey: "disc-key-123" } as PlexMediaItem;
    const client = makePlexClient({
      searchDiscover: vi.fn().mockResolvedValue([searchResult]),
      getUserState: vi.fn().mockResolvedValue({ viewCount: 1, lastViewedAt: 1772443712 }),
    });

    mockFetchResponses([
      PLEX_USER_RESPONSE,
      { url: "community.plex.tv/api", body: { data: { activityFeed: { nodes: [] } } } },
    ]);

    const result = await checkAndLogMovieWatch(client, 670, "Shrek", 808);

    expect(result).toBe(true);
    expect(mockLogWatch).toHaveBeenCalledTimes(1);
  });

  it("returns false when movie not found on Discover", async () => {
    const client = makePlexClient();
    const result = await checkAndLogMovieWatch(client, 1, "Shrek", 42);
    expect(result).toBe(false);
  });

  it("returns false when not watched", async () => {
    mockFindDiscoverMatch.mockResolvedValue("disc-key-123");

    const searchResult = { ratingKey: "disc-key-123" } as PlexMediaItem;
    const client = makePlexClient({
      searchDiscover: vi.fn().mockResolvedValue([searchResult]),
      getUserState: vi.fn().mockResolvedValue({ viewCount: 0, lastViewedAt: null }),
    });

    const result = await checkAndLogMovieWatch(client, 1, "Shrek", 808);
    expect(result).toBe(false);
  });

  it("returns false on error without throwing", async () => {
    const client = makePlexClient({
      searchDiscover: vi.fn().mockRejectedValue(new Error("Network error")),
    });

    const result = await checkAndLogMovieWatch(client, 1, "Shrek", 42);
    expect(result).toBe(false);
  });
});
