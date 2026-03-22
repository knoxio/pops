/**
 * Plex sync service tests — mocks PlexClient, library service, and watch history.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PlexMediaItem } from "./types.js";

// Mock dependencies before importing service
vi.mock("./client.js", () => ({
  PlexClient: vi.fn(),
}));

vi.mock("../../../env.js", () => ({
  getEnv: vi.fn(),
}));

vi.mock("../../../db.js", () => ({
  getDrizzle: vi.fn(),
}));

vi.mock("../library/service.js", () => ({
  addMovie: vi.fn(),
}));

vi.mock("../library/tv-show-service.js", () => ({
  addTvShow: vi.fn(),
}));

vi.mock("../tmdb/index.js", () => ({
  getTmdbClient: vi.fn(),
}));

vi.mock("../thetvdb/index.js", () => ({
  getTvdbClient: vi.fn(),
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

// Now import the service
import {
  getPlexClient,
  testConnection,
  syncMovies,
  getSyncStatus,
  _resetSyncState,
} from "./service.js";
import { PlexClient } from "./client.js";
import { getEnv } from "../../../env.js";
import * as libraryService from "../library/service.js";
import { getTmdbClient } from "../tmdb/index.js";
import { logWatch } from "../watch-history/service.js";

const mockGetEnv = vi.mocked(getEnv);
const mockGetTmdbClient = vi.mocked(getTmdbClient);
const mockAddMovie = vi.mocked(libraryService.addMovie);
const mockLogWatch = vi.mocked(logWatch);

beforeEach(() => {
  vi.clearAllMocks();
  _resetSyncState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getPlexClient", () => {
  it("returns null when PLEX_URL is not set", () => {
    mockGetEnv.mockReturnValue(undefined);
    expect(getPlexClient()).toBeNull();
  });

  it("returns null when PLEX_TOKEN is not set", () => {
    mockGetEnv.mockImplementation((name) =>
      name === "PLEX_URL" ? "http://plex:32400" : undefined
    );
    expect(getPlexClient()).toBeNull();
  });

  it("returns PlexClient when both env vars are set", () => {
    mockGetEnv.mockImplementation((name) => {
      if (name === "PLEX_URL") return "http://plex:32400";
      if (name === "PLEX_TOKEN") return "abc123";
      return undefined;
    });
    const client = getPlexClient();
    expect(client).toBeInstanceOf(PlexClient);
  });
});

describe("testConnection", () => {
  it("returns true when getLibraries succeeds", async () => {
    const mockClient = {
      getLibraries: vi.fn().mockResolvedValue([]),
    } as unknown as PlexClient;

    const result = await testConnection(mockClient);
    expect(result).toBe(true);
    expect(mockClient.getLibraries).toHaveBeenCalledOnce();
  });

  it("returns false when getLibraries fails", async () => {
    const mockClient = {
      getLibraries: vi.fn().mockRejectedValue(new Error("Connection refused")),
    } as unknown as PlexClient;

    const result = await testConnection(mockClient);
    expect(result).toBe(false);
  });
});

describe("syncMovies", () => {
  const mockPlexMovie: PlexMediaItem = {
    ratingKey: "100",
    type: "movie",
    title: "Fight Club",
    originalTitle: "Fight Club",
    summary: "An insomniac...",
    tagline: null,
    year: 1999,
    thumbUrl: null,
    artUrl: null,
    durationMs: 8340000,
    addedAt: 1711000000,
    updatedAt: 1711000100,
    lastViewedAt: 1711500000,
    viewCount: 3,
    rating: 8.0,
    audienceRating: 8.8,
    contentRating: "R",
    externalIds: [
      { source: "tmdb", id: "550" },
      { source: "imdb", id: "tt0137523" },
    ],
    genres: ["Drama", "Thriller"],
    directors: ["David Fincher"],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
  };

  it("returns error when TMDB client is not configured", async () => {
    mockGetTmdbClient.mockReturnValue(null);
    const mockClient = {
      getAllItems: vi.fn(),
    } as unknown as PlexClient;

    const result = await syncMovies(mockClient, "1");

    expect(result.synced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("TMDB_API_KEY");
  });

  it("syncs movie with TMDB ID and logs watch history", async () => {
    const fakeTmdbClient = {} as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(fakeTmdbClient);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1, title: "Fight Club" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const mockClient = {
      getAllItems: vi.fn().mockResolvedValue([mockPlexMovie]),
    } as unknown as PlexClient;

    const result = await syncMovies(mockClient, "1");

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockAddMovie).toHaveBeenCalledWith(550, fakeTmdbClient);
    expect(mockLogWatch).toHaveBeenCalledWith({
      mediaType: "movie",
      mediaId: 1,
      watchedAt: expect.any(String),
      completed: 1,
    });
  });

  it("skips movies without TMDB ID", async () => {
    const fakeTmdbClient = {} as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(fakeTmdbClient);

    const noTmdbMovie: PlexMediaItem = {
      ...mockPlexMovie,
      externalIds: [{ source: "imdb", id: "tt0137523" }],
    };

    const mockClient = {
      getAllItems: vi.fn().mockResolvedValue([noTmdbMovie]),
    } as unknown as PlexClient;

    const result = await syncMovies(mockClient, "1");

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockAddMovie).not.toHaveBeenCalled();
  });

  it("does not log watch history for unwatched movies", async () => {
    const fakeTmdbClient = {} as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(fakeTmdbClient);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1, title: "Fight Club" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const unwatchedMovie: PlexMediaItem = {
      ...mockPlexMovie,
      viewCount: 0,
      lastViewedAt: null,
    };

    const mockClient = {
      getAllItems: vi.fn().mockResolvedValue([unwatchedMovie]),
    } as unknown as PlexClient;

    const result = await syncMovies(mockClient, "1");

    expect(result.synced).toBe(1);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it("records errors for failed movies without stopping sync", async () => {
    const fakeTmdbClient = {} as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(fakeTmdbClient);
    mockAddMovie.mockRejectedValue(new Error("TMDB 404"));

    const mockClient = {
      getAllItems: vi.fn().mockResolvedValue([mockPlexMovie]),
    } as unknown as PlexClient;

    const result = await syncMovies(mockClient, "1");

    expect(result.synced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].title).toBe("Fight Club");
    expect(result.errors[0].reason).toContain("TMDB 404");
  });
});

describe("getSyncStatus", () => {
  it("reports not configured when client is null", () => {
    const status = getSyncStatus(null);
    expect(status.configured).toBe(false);
    expect(status.lastSyncMovies).toBeNull();
    expect(status.lastSyncTvShows).toBeNull();
  });

  it("reports configured when client is provided", () => {
    const mockClient = {} as PlexClient;
    const status = getSyncStatus(mockClient);
    expect(status.configured).toBe(true);
  });

  it("reflects last sync results after syncMovies", async () => {
    const fakeTmdbClient = {} as ReturnType<typeof getTmdbClient>;
    mockGetTmdbClient.mockReturnValue(fakeTmdbClient);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1 } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const mockClient = {
      getAllItems: vi.fn().mockResolvedValue([
        {
          ratingKey: "1",
          type: "movie",
          title: "Test",
          externalIds: [{ source: "tmdb", id: "123" }],
          viewCount: 0,
          lastViewedAt: null,
          genres: [],
          directors: [],
        } as unknown as PlexMediaItem,
      ]),
    } as unknown as PlexClient;

    await syncMovies(mockClient, "1");

    const status = getSyncStatus(mockClient);
    expect(status.lastSyncMovies).not.toBeNull();
    expect(status.lastSyncMovies!.synced).toBe(1);
  });
});
