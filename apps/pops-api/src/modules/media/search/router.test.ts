/**
 * Media search router tests — TMDB movie search and TheTVDB series search.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestContext, createCaller } from "../../../shared/test-utils.js";
import { TRPCError } from "@trpc/server";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;

beforeEach(() => {
  ({ caller } = ctx.setup());
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("THETVDB_API_KEY", "test-tvdb-key");
});

afterEach(() => {
  ctx.teardown();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Create a mock Response object. */
function mockResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(""),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/** Mock a successful TMDB search response. */
function mockTmdbSearch(results: unknown[], page = 1, totalResults = 1, totalPages = 1): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      mockResponse({
        page,
        total_results: totalResults,
        total_pages: totalPages,
        results,
      })
    )
  );
}

/** Build a raw TMDB search result. */
function rawTmdbResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 550,
    title: "Fight Club",
    original_title: "Fight Club",
    overview: "An insomniac office worker...",
    release_date: "1999-10-15",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    vote_average: 8.4,
    vote_count: 28000,
    genre_ids: [18, 53],
    original_language: "en",
    popularity: 61.5,
    ...overrides,
  };
}

/** Mock fetch for TheTVDB — handles login + search transparently. */
function mockTvdbSearch(results: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/login")) {
        return Promise.resolve(
          mockResponse({ status: "success", data: { token: "test-jwt-token" } })
        );
      }
      return Promise.resolve(mockResponse({ status: "success", data: results }));
    })
  );
}

describe("media.search.movies", () => {
  it("returns TMDB search results", async () => {
    mockTmdbSearch([rawTmdbResult()], 1, 1, 1);

    const result = await caller.media.search.movies({ query: "Fight Club" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.tmdbId).toBe(550);
    expect(result.results[0]!.title).toBe("Fight Club");
    expect(result.results[0]!.posterPath).toBe("/poster.jpg");
    expect(result.page).toBe(1);
    expect(result.totalResults).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("passes page parameter to TMDB", async () => {
    mockTmdbSearch([rawTmdbResult()], 2, 50, 3);

    const result = await caller.media.search.movies({ query: "Fight Club", page: 2 });

    expect(result.page).toBe(2);
    expect(result.totalResults).toBe(50);
    expect(result.totalPages).toBe(3);
  });

  it("returns empty results for no matches", async () => {
    mockTmdbSearch([], 1, 0, 0);

    const result = await caller.media.search.movies({ query: "zzzznonexistent" });

    expect(result.results).toHaveLength(0);
    expect(result.totalResults).toBe(0);
  });

  it("rejects page exceeding max", async () => {
    await expect(caller.media.search.movies({ query: "test", page: 501 })).rejects.toThrow();
  });

  it("rejects query exceeding max length", async () => {
    await expect(caller.media.search.movies({ query: "a".repeat(201) })).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR on TMDB API failure", async () => {
    expect.assertions(2);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ status_message: "Invalid API key" }, 401, false))
    );

    try {
      await caller.media.search.movies({ query: "test" });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
    }
  });

  it("requires authentication", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.media.search.movies({ query: "test" })).rejects.toThrow(TRPCError);
  });
});

describe("media.search.tvShows", () => {
  it("returns TheTVDB search results", async () => {
    mockTvdbSearch([
      {
        tvdb_id: "73255",
        objectID: "series-73255",
        name: "Breaking Bad",
        overview: "A chemistry teacher diagnosed with cancer...",
        first_air_time: "2008-01-20",
        status: "Ended",
        image_url: "/poster.jpg",
        genres: ["Drama", "Thriller"],
        primary_language: "eng",
        year: "2008",
      },
    ]);

    const result = await caller.media.search.tvShows({ query: "Breaking Bad" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.tvdbId).toBe(73255);
    expect(result.results[0]!.name).toBe("Breaking Bad");
    expect(result.results[0]!.overview).toBe("A chemistry teacher diagnosed with cancer...");
  });

  it("returns empty results for no matches", async () => {
    mockTvdbSearch([]);

    const result = await caller.media.search.tvShows({ query: "zzzznonexistent" });

    expect(result.results).toHaveLength(0);
  });

  it("rejects query exceeding max length", async () => {
    await expect(caller.media.search.tvShows({ query: "a".repeat(201) })).rejects.toThrow();
  });

  it("throws INTERNAL_SERVER_ERROR on TheTVDB API failure", async () => {
    expect.assertions(2);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/login")) {
          return Promise.resolve(
            mockResponse({ status: "success", data: { token: "test-jwt-token" } })
          );
        }
        return Promise.resolve(mockResponse({ message: "Server error" }, 500, false));
      })
    );

    try {
      await caller.media.search.tvShows({ query: "test" });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
    }
  });

  it("requires authentication", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.media.search.tvShows({ query: "test" })).rejects.toThrow(TRPCError);
  });
});
