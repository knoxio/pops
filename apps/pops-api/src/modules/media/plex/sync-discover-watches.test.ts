/**
 * Tests for Plex Discover cloud watch sync.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PlexClient } from "./client.js";
import type { PlexMediaItem } from "./types.js";

// Mock dependencies
vi.mock("../movies/service.js", () => ({
  getMovieByTmdbId: vi.fn(),
}));

vi.mock("../watch-history/service.js", () => ({
  logWatch: vi.fn(),
}));

vi.mock("../../../db.js", () => ({
  getDrizzle: vi.fn(),
}));

vi.mock("@pops/db-types", () => ({
  movies: { id: "id", title: "title", tmdbId: "tmdb_id" },
  tvShows: { id: "id", name: "name", tvdbId: "tvdb_id" },
}));

import { syncDiscoverWatches, checkAndLogMovieWatch } from "./sync-discover-watches.js";
import { logWatch } from "../watch-history/service.js";
import { getDrizzle } from "../../../db.js";

const mockLogWatch = vi.mocked(logWatch);
const mockGetDrizzle = vi.mocked(getDrizzle);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiscoverItem(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: "discover-123",
    type: "movie",
    title: "Test Movie",
    originalTitle: null,
    summary: null,
    tagline: null,
    year: 2024,
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
    externalIds: [{ source: "tmdb", id: "550" }],
    genres: [],
    directors: [],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
    ...overrides,
  };
}

function makePlexClient(
  discoverResults: PlexMediaItem[] = [],
  userState: { viewCount: number; lastViewedAt: number | null } | null = null
): PlexClient {
  return {
    searchDiscover: vi.fn().mockResolvedValue(discoverResults),
    getUserState: vi.fn().mockResolvedValue(userState),
  } as unknown as PlexClient;
}

function setupDrizzleMock(
  movieRows: Array<{ id: number; title: string; tmdbId: number }> = [],
  showRows: Array<{ id: number; name: string; tvdbId: number }> = []
): void {
  const mockAll = vi.fn().mockReturnValueOnce(movieRows).mockReturnValueOnce(showRows);
  const mockFrom = vi.fn().mockReturnValue({ all: mockAll });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  mockGetDrizzle.mockReturnValue({ select: mockSelect } as unknown as ReturnType<
    typeof getDrizzle
  >);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
});

describe("syncDiscoverWatches", () => {
  it("logs watch for a movie found as watched on Plex Discover", async () => {
    setupDrizzleMock([{ id: 1, title: "Fight Club", tmdbId: 550 }], []);
    mockLogWatch.mockReturnValue({
      entry: { id: 1 },
      created: true,
      watchlistRemoved: false,
    } as unknown as ReturnType<typeof logWatch>);

    const client = makePlexClient(
      [makeDiscoverItem({ ratingKey: "disc-1", externalIds: [{ source: "tmdb", id: "550" }] })],
      { viewCount: 3, lastViewedAt: 1711500000 }
    );
    const result = await syncDiscoverWatches(client);

    expect(result.movies.watched).toBe(1);
    expect(result.movies.logged).toBe(1);
    expect(mockLogWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: "movie",
        mediaId: 1,
        source: "plex_sync",
      })
    );
  });

  it("counts already-logged movies correctly", async () => {
    setupDrizzleMock([{ id: 1, title: "Fight Club", tmdbId: 550 }], []);
    mockLogWatch.mockReturnValue({
      entry: { id: 1 },
      created: false,
      watchlistRemoved: false,
    } as unknown as ReturnType<typeof logWatch>);

    const client = makePlexClient(
      [makeDiscoverItem({ externalIds: [{ source: "tmdb", id: "550" }] })],
      { viewCount: 1, lastViewedAt: null }
    );
    const result = await syncDiscoverWatches(client);

    expect(result.movies.watched).toBe(1);
    expect(result.movies.alreadyLogged).toBe(1);
    expect(result.movies.logged).toBe(0);
  });

  it("counts movies not found on Discover", async () => {
    setupDrizzleMock([{ id: 1, title: "Obscure Film", tmdbId: 999 }], []);

    // searchDiscover returns no results
    const client = makePlexClient([], null);
    const result = await syncDiscoverWatches(client);

    expect(result.movies.notFound).toBe(1);
    expect(result.movies.watched).toBe(0);
  });

  it("skips movies not watched on Plex", async () => {
    setupDrizzleMock([{ id: 1, title: "Fight Club", tmdbId: 550 }], []);

    const client = makePlexClient(
      [makeDiscoverItem({ externalIds: [{ source: "tmdb", id: "550" }] })],
      { viewCount: 0, lastViewedAt: null }
    );
    const result = await syncDiscoverWatches(client);

    expect(result.movies.watched).toBe(0);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it("handles empty library", async () => {
    setupDrizzleMock([], []);

    const client = makePlexClient();
    const result = await syncDiscoverWatches(client);

    expect(result.movies.total).toBe(0);
    expect(result.tvShows.total).toBe(0);
  });
});

describe("checkAndLogMovieWatch", () => {
  it("returns true when movie is watched and newly logged", async () => {
    mockLogWatch.mockReturnValue({
      entry: { id: 1 },
      created: true,
      watchlistRemoved: false,
    } as unknown as ReturnType<typeof logWatch>);

    const client = makePlexClient(
      [makeDiscoverItem({ externalIds: [{ source: "tmdb", id: "42" }] })],
      { viewCount: 1, lastViewedAt: 1711500000 }
    );
    const result = await checkAndLogMovieWatch(client, 1, "Shrek", 42);

    expect(result).toBe(true);
  });

  it("returns false when movie is not watched", async () => {
    const client = makePlexClient(
      [makeDiscoverItem({ externalIds: [{ source: "tmdb", id: "42" }] })],
      { viewCount: 0, lastViewedAt: null }
    );
    const result = await checkAndLogMovieWatch(client, 1, "Shrek", 42);

    expect(result).toBe(false);
  });

  it("returns false when movie not found on Discover", async () => {
    const client = makePlexClient([], null);
    const result = await checkAndLogMovieWatch(client, 1, "Shrek", 42);

    expect(result).toBe(false);
  });

  it("returns false on error without throwing", async () => {
    const client = {
      searchDiscover: vi.fn().mockRejectedValue(new Error("Network error")),
      getUserState: vi.fn(),
    } as unknown as PlexClient;

    const result = await checkAndLogMovieWatch(client, 1, "Shrek", 42);

    expect(result).toBe(false);
  });
});
