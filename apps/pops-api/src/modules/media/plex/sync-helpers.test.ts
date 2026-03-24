/**
 * Tests for shared Plex sync helpers — external ID extraction,
 * movie watch logging, and episode watch syncing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PlexMediaItem, PlexEpisode } from "./types.js";

// Mock dependencies
vi.mock("../../../db.js", () => ({
  getDrizzle: vi.fn(),
}));

vi.mock("../tv-shows/service.js", () => ({
  getTvShowByTvdbId: vi.fn(),
}));

vi.mock("../watch-history/service.js", () => ({
  logWatch: vi.fn(),
}));

vi.mock("@pops/db-types", () => ({
  episodes: { seasonId: "seasonId", episodeNumber: "episodeNumber", id: "id" },
  seasons: { tvShowId: "tvShowId", seasonNumber: "seasonNumber", id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
}));

import { extractExternalIdAsNumber, logMovieWatch, syncEpisodeWatches } from "./sync-helpers.js";
import { getTvShowByTvdbId } from "../tv-shows/service.js";
import { logWatch } from "../watch-history/service.js";
import { getDrizzle } from "../../../db.js";

const mockGetTvShowByTvdbId = vi.mocked(getTvShowByTvdbId);
const mockLogWatch = vi.mocked(logWatch);
const mockGetDrizzle = vi.mocked(getDrizzle);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(externalIds: { source: string; id: string }[]): PlexMediaItem {
  return {
    ratingKey: "1",
    type: "movie",
    title: "Test",
    originalTitle: "Test",
    summary: "",
    tagline: null,
    year: 2024,
    thumbUrl: null,
    artUrl: null,
    durationMs: 7200000,
    addedAt: 1700000000,
    updatedAt: 1700000000,
    lastViewedAt: null,
    viewCount: 0,
    rating: null,
    audienceRating: null,
    contentRating: null,
    externalIds,
    genres: [],
    directors: [],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
  };
}

function makeEpisode(overrides: Partial<PlexEpisode> = {}): PlexEpisode {
  return {
    ratingKey: "300",
    title: "Pilot",
    episodeIndex: 1,
    seasonIndex: 1,
    summary: "",
    thumbUrl: null,
    durationMs: 3600000,
    addedAt: 1700000000,
    updatedAt: 1700000000,
    lastViewedAt: 1711400000,
    viewCount: 1,
    ...overrides,
  };
}

function makeMockDb(seasonResult: unknown = undefined, episodeResult: unknown = undefined): void {
  // Each select() call must create its own chain so mockReturnValueOnce works correctly
  let callCount = 0;
  const results = [seasonResult, episodeResult];
  const mockSelect = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation(() => results[callCount++]),
      }),
    }),
  }));
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

describe("extractExternalIdAsNumber", () => {
  it("extracts a numeric TMDB ID", () => {
    const item = makeItem([{ source: "tmdb", id: "550" }]);
    expect(extractExternalIdAsNumber(item, "tmdb")).toBe(550);
  });

  it("extracts a numeric TVDB ID", () => {
    const item = makeItem([{ source: "tvdb", id: "81189" }]);
    expect(extractExternalIdAsNumber(item, "tvdb")).toBe(81189);
  });

  it("returns null when source is not found", () => {
    const item = makeItem([{ source: "imdb", id: "tt0137523" }]);
    expect(extractExternalIdAsNumber(item, "tmdb")).toBeNull();
  });

  it("returns null for non-numeric ID", () => {
    const item = makeItem([{ source: "tmdb", id: "invalid" }]);
    expect(extractExternalIdAsNumber(item, "tmdb")).toBeNull();
  });

  it("returns null for empty externalIds", () => {
    const item = makeItem([]);
    expect(extractExternalIdAsNumber(item, "tmdb")).toBeNull();
  });

  it("picks the correct source when multiple IDs exist", () => {
    const item = makeItem([
      { source: "tmdb", id: "550" },
      { source: "tvdb", id: "81189" },
      { source: "imdb", id: "tt0137523" },
    ]);
    expect(extractExternalIdAsNumber(item, "tmdb")).toBe(550);
    expect(extractExternalIdAsNumber(item, "tvdb")).toBe(81189);
  });
});

describe("logMovieWatch", () => {
  it("calls logWatch with correct parameters", () => {
    logMovieWatch(42, 1711500000);

    expect(mockLogWatch).toHaveBeenCalledOnce();
    expect(mockLogWatch).toHaveBeenCalledWith({
      mediaType: "movie",
      mediaId: 42,
      watchedAt: new Date(1711500000 * 1000).toISOString(),
      completed: 1,
      source: "plex_sync",
    });
  });

  it("silently ignores duplicate watch errors", () => {
    mockLogWatch.mockImplementation(() => {
      throw new Error("UNIQUE constraint failed");
    });

    expect(() => logMovieWatch(42, 1711500000)).not.toThrow();
  });
});

describe("syncEpisodeWatches", () => {
  it("returns 0 when show is not found", () => {
    mockGetTvShowByTvdbId.mockReturnValue(null);

    const result = syncEpisodeWatches(81189, [makeEpisode()]);

    expect(result).toBe(0);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it("matches and logs watched episodes", () => {
    mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as unknown as ReturnType<
      typeof getTvShowByTvdbId
    >);
    makeMockDb({ id: 10 }, { id: 100 });

    const ep = makeEpisode({ viewCount: 1, lastViewedAt: 1711400000 });
    const result = syncEpisodeWatches(81189, [ep]);

    expect(result).toBe(1);
    expect(mockLogWatch).toHaveBeenCalledWith({
      mediaType: "episode",
      mediaId: 100,
      watchedAt: new Date(1711400000 * 1000).toISOString(),
      completed: 1,
      source: "plex_sync",
    });
  });

  it("skips unwatched episodes (viewCount === 0)", () => {
    mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as unknown as ReturnType<
      typeof getTvShowByTvdbId
    >);

    const ep = makeEpisode({ viewCount: 0 });
    const result = syncEpisodeWatches(81189, [ep]);

    expect(result).toBe(0);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it("skips episodes when season not found in DB", () => {
    mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as unknown as ReturnType<
      typeof getTvShowByTvdbId
    >);
    makeMockDb(undefined, undefined);

    const ep = makeEpisode({ viewCount: 1 });
    const result = syncEpisodeWatches(81189, [ep]);

    expect(result).toBe(0);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it("skips episodes when episode not found in DB", () => {
    mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as unknown as ReturnType<
      typeof getTvShowByTvdbId
    >);
    makeMockDb({ id: 10 }, undefined);

    const ep = makeEpisode({ viewCount: 1 });
    const result = syncEpisodeWatches(81189, [ep]);

    expect(result).toBe(0);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it("uses current date when lastViewedAt is null", () => {
    mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as unknown as ReturnType<
      typeof getTvShowByTvdbId
    >);
    makeMockDb({ id: 10 }, { id: 100 });

    const now = new Date("2026-03-24T12:00:00Z");
    vi.setSystemTime(now);

    const ep = makeEpisode({ viewCount: 1, lastViewedAt: null });
    syncEpisodeWatches(81189, [ep]);

    expect(mockLogWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        watchedAt: now.toISOString(),
      })
    );

    vi.useRealTimers();
  });

  it("ignores duplicate watch errors without affecting count", () => {
    mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as unknown as ReturnType<
      typeof getTvShowByTvdbId
    >);
    makeMockDb({ id: 10 }, { id: 100 });
    mockLogWatch.mockImplementation(() => {
      throw new Error("UNIQUE constraint failed");
    });

    const ep = makeEpisode({ viewCount: 1 });
    const result = syncEpisodeWatches(81189, [ep]);

    // Error during logWatch means matched++ is not reached
    expect(result).toBe(0);
  });

  it("returns 0 for empty episode list", () => {
    mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as unknown as ReturnType<
      typeof getTvShowByTvdbId
    >);

    const result = syncEpisodeWatches(81189, []);

    expect(result).toBe(0);
  });
});
