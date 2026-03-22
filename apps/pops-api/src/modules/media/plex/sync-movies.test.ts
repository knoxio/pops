/**
 * Tests for Plex movie import — batch sync with progress tracking and fallback matching.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PlexMediaItem } from "./types.js";
import type { TmdbClient } from "../tmdb/client.js";
import type { PlexClient } from "./client.js";

// Mock dependencies
vi.mock("../tmdb/index.js", () => ({
  getTmdbClient: vi.fn(),
}));

vi.mock("../library/service.js", () => ({
  addMovie: vi.fn(),
}));

vi.mock("../watch-history/service.js", () => ({
  logWatch: vi.fn(),
}));

import { importMoviesFromPlex } from "./sync-movies.js";
import { getTmdbClient } from "../tmdb/index.js";
import * as libraryService from "../library/service.js";
import { logWatch } from "../watch-history/service.js";

const mockGetTmdbClient = vi.mocked(getTmdbClient);
const mockAddMovie = vi.mocked(libraryService.addMovie);
const mockLogWatch = vi.mocked(logWatch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlexMovie(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: "100",
    type: "movie",
    title: "Fight Club",
    originalTitle: "Fight Club",
    summary: "An insomniac office worker...",
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
    ...overrides,
  };
}

function makePlexClient(items: PlexMediaItem[]): PlexClient {
  return {
    getAllItems: vi.fn().mockResolvedValue(items),
  } as unknown as PlexClient;
}

function makeTmdbClient(overrides: Partial<TmdbClient> = {}): TmdbClient {
  return {
    searchMovies: vi
      .fn()
      .mockResolvedValue({ results: [], totalResults: 0, totalPages: 0, page: 1 }),
    ...overrides,
  } as unknown as TmdbClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importMoviesFromPlex", () => {
  it("returns error when TMDB client is not configured", async () => {
    mockGetTmdbClient.mockReturnValue(null);
    const client = makePlexClient([]);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.total).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("TMDB_API_KEY");
    expect(client.getAllItems).not.toHaveBeenCalled();
  });

  it("syncs movie using TMDB ID from Plex Guid", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1, title: "Fight Club" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const movie = makePlexMovie();
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockAddMovie).toHaveBeenCalledWith(550, tmdb);
    // Should not fall back to search since Guid had TMDB ID
    expect(tmdb.searchMovies).not.toHaveBeenCalled();
  });

  it("logs watch history for watched movies", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockAddMovie.mockResolvedValue({
      movie: { id: 42, title: "Fight Club" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const movie = makePlexMovie({ viewCount: 3, lastViewedAt: 1711500000 });
    const client = makePlexClient([movie]);

    await importMoviesFromPlex(client, "1");

    expect(mockLogWatch).toHaveBeenCalledWith({
      mediaType: "movie",
      mediaId: 42,
      watchedAt: expect.any(String),
      completed: 1,
    });
  });

  it("does not log watch history for unwatched movies", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1, title: "Fight Club" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const movie = makePlexMovie({ viewCount: 0, lastViewedAt: null });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.synced).toBe(1);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it("skips movies when TMDB ID cannot be resolved", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const movie = makePlexMovie({
      externalIds: [{ source: "imdb", id: "tt0137523" }],
    });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockAddMovie).not.toHaveBeenCalled();
  });

  it("falls back to TMDB title+year search when no Guid", async () => {
    const tmdb = makeTmdbClient({
      searchMovies: vi.fn().mockResolvedValue({
        results: [{ tmdbId: 550, title: "Fight Club", releaseDate: "1999-10-15" }],
        totalResults: 1,
        totalPages: 1,
        page: 1,
      }),
    } as unknown as Partial<TmdbClient>);
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1, title: "Fight Club" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const movie = makePlexMovie({
      externalIds: [{ source: "imdb", id: "tt0137523" }],
    });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.synced).toBe(1);
    expect(tmdb.searchMovies).toHaveBeenCalledWith("Fight Club");
    expect(mockAddMovie).toHaveBeenCalledWith(550, tmdb);
  });

  it("skips when TMDB search returns no matching title", async () => {
    const tmdb = makeTmdbClient({
      searchMovies: vi.fn().mockResolvedValue({
        results: [{ tmdbId: 999, title: "Completely Different Movie", releaseDate: "2020-01-01" }],
        totalResults: 1,
        totalPages: 1,
        page: 1,
      }),
    } as unknown as Partial<TmdbClient>);
    mockGetTmdbClient.mockReturnValue(tmdb);

    const movie = makePlexMovie({
      externalIds: [],
    });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("records errors for failed movies without stopping sync", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const goodMovie = makePlexMovie({ ratingKey: "1", title: "Good Movie" });
    const badMovie = makePlexMovie({ ratingKey: "2", title: "Bad Movie" });

    mockAddMovie.mockRejectedValueOnce(new Error("TMDB 404")).mockResolvedValueOnce({
      movie: { id: 2, title: "Good Movie" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const client = makePlexClient([badMovie, goodMovie]);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].title).toBe("Bad Movie");
    expect(result.errors[0].reason).toContain("TMDB 404");
    expect(result.processed).toBe(2);
  });

  it("calls onProgress callback after each item", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1, title: "Test" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const movies = [
      makePlexMovie({ ratingKey: "1", title: "Movie 1" }),
      makePlexMovie({ ratingKey: "2", title: "Movie 2" }),
    ];
    const client = makePlexClient(movies);
    const onProgress = vi.fn();

    await importMoviesFromPlex(client, "1", { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    // Progress object is passed by reference, so capture the final state
    const finalProgress = onProgress.mock.calls[1][0];
    expect(finalProgress.processed).toBe(2);
    expect(finalProgress.synced).toBe(2);
    expect(finalProgress.total).toBe(2);
  });

  it("handles multiple movies in batch", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1, title: "Test" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });

    const movies = Array.from({ length: 5 }, (_, i) =>
      makePlexMovie({
        ratingKey: String(i + 1),
        title: `Movie ${i + 1}`,
        externalIds: [{ source: "tmdb", id: String(100 + i) }],
        viewCount: 0,
        lastViewedAt: null,
      })
    );
    const client = makePlexClient(movies);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.total).toBe(5);
    expect(result.processed).toBe(5);
    expect(result.synced).toBe(5);
    expect(result.errors).toHaveLength(0);
    expect(mockAddMovie).toHaveBeenCalledTimes(5);
  });

  it("handles empty library section", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const client = makePlexClient([]);

    const result = await importMoviesFromPlex(client, "1");

    expect(result.total).toBe(0);
    expect(result.processed).toBe(0);
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("ignores duplicate watch history errors", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);
    mockAddMovie.mockResolvedValue({
      movie: { id: 1, title: "Fight Club" } as unknown as import("../movies/types.js").Movie,
      created: true,
    });
    mockLogWatch.mockImplementation(() => {
      throw new Error("UNIQUE constraint failed");
    });

    const movie = makePlexMovie({ viewCount: 2, lastViewedAt: 1711500000 });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, "1");

    // Should still count as synced despite watch history error
    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("handles non-numeric TMDB ID in Plex Guid gracefully", async () => {
    const tmdb = makeTmdbClient();
    mockGetTmdbClient.mockReturnValue(tmdb);

    const movie = makePlexMovie({
      externalIds: [{ source: "tmdb", id: "invalid" }],
    });
    const client = makePlexClient([movie]);

    const result = await importMoviesFromPlex(client, "1");

    // Should fall back to search, which returns empty, so skipped
    expect(result.skipped).toBe(1);
  });
});
