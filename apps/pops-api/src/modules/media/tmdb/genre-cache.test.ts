import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GenreCache, CACHE_TTL_MS, getGenreCache, setGenreCache } from "./genre-cache.js";
import type { TmdbClient } from "./client.js";
import type { TmdbGenreListResponse } from "./types.js";

const TEST_GENRES = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
];

function makeMockClient(genres = TEST_GENRES): TmdbClient {
  return {
    getGenreList: vi.fn().mockResolvedValue({ genres } as TmdbGenreListResponse),
  } as unknown as TmdbClient;
}

describe("GenreCache", () => {
  let cache: GenreCache;
  let client: TmdbClient;

  beforeEach(() => {
    client = makeMockClient();
    cache = new GenreCache(client);
  });

  describe("ensureLoaded", () => {
    it("fetches genres lazily on first call", async () => {
      expect(cache.size).toBe(0);
      await cache.ensureLoaded();
      expect(cache.size).toBe(3);
      expect(client.getGenreList).toHaveBeenCalledTimes(1);
    });

    it("does not re-fetch within TTL", async () => {
      await cache.ensureLoaded();
      await cache.ensureLoaded();
      expect(client.getGenreList).toHaveBeenCalledTimes(1);
    });

    it("re-fetches after TTL expires", async () => {
      vi.useFakeTimers();
      try {
        await cache.ensureLoaded();
        expect(client.getGenreList).toHaveBeenCalledTimes(1);

        // Advance past TTL
        vi.advanceTimersByTime(CACHE_TTL_MS + 1);

        await cache.ensureLoaded();
        expect(client.getGenreList).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("propagates client errors", async () => {
      const failClient = {
        getGenreList: vi.fn().mockRejectedValue(new Error("TMDB API error: 401 Unauthorized")),
      } as unknown as TmdbClient;
      const failCache = new GenreCache(failClient);

      await expect(failCache.ensureLoaded()).rejects.toThrow("TMDB API error: 401 Unauthorized");
    });

    it("deduplicates concurrent requests", async () => {
      let resolvePromise: (value: TmdbGenreListResponse) => void;
      const delayed = new Promise<TmdbGenreListResponse>((resolve) => {
        resolvePromise = resolve;
      });

      const slowClient = {
        getGenreList: vi.fn().mockReturnValue(delayed),
      } as unknown as TmdbClient;
      const slowCache = new GenreCache(slowClient);

      const p1 = slowCache.ensureLoaded();
      const p2 = slowCache.ensureLoaded();

      resolvePromise!({ genres: TEST_GENRES });
      await Promise.all([p1, p2]);

      expect(slowClient.getGenreList).toHaveBeenCalledTimes(1);
      expect(slowCache.size).toBe(3);
    });
  });

  describe("mapGenreIds", () => {
    it("maps known genre IDs to names", async () => {
      const names = await cache.mapGenreIds([28, 18]);
      expect(names).toEqual(["Action", "Drama"]);
    });

    it("skips unknown genre IDs", async () => {
      const names = await cache.mapGenreIds([28, 9999, 35]);
      expect(names).toEqual(["Action", "Comedy"]);
    });

    it("returns empty array for all unknown IDs", async () => {
      const names = await cache.mapGenreIds([100, 200]);
      expect(names).toEqual([]);
    });

    it("returns empty array for empty input", async () => {
      const names = await cache.mapGenreIds([]);
      expect(names).toEqual([]);
    });
  });

  describe("clear", () => {
    it("resets cache state and triggers re-fetch", async () => {
      await cache.ensureLoaded();
      expect(cache.size).toBe(3);

      cache.clear();
      expect(cache.size).toBe(0);

      await cache.ensureLoaded();
      expect(client.getGenreList).toHaveBeenCalledTimes(2);
    });
  });
});

describe("singleton helpers", () => {
  afterEach(() => {
    setGenreCache(null);
  });

  it("getGenreCache creates singleton from client", () => {
    const client = makeMockClient();
    const cache = getGenreCache(client);
    expect(cache).toBeInstanceOf(GenreCache);
    expect(getGenreCache(client)).toBe(cache);
  });

  it("setGenreCache replaces the singleton", () => {
    const client = makeMockClient();
    const original = getGenreCache(client);

    const custom = new GenreCache(client);
    setGenreCache(custom);

    expect(getGenreCache(client)).toBe(custom);
    expect(getGenreCache(client)).not.toBe(original);
  });
});
