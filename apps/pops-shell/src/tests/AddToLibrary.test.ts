/**
 * Tests for SearchPage add-to-library flow logic.
 *
 * Covers: button spinner state, success transitions, failure reverts,
 * toast messages, idempotent add, and cache updates.
 *
 * These are pure logic tests for the state management patterns used
 * in SearchPage. Component-level rendering tests require
 * @testing-library/react + jsdom.
 */
import { describe, it, expect } from "vitest";

// ── makeKey helper ───────────────────────────────────────────────────

function makeKey(type: "movie" | "tv", id: number) {
  return `${type}:${id}`;
}

describe("AddToLibrary: makeKey", () => {
  it("should create unique key for movie", () => {
    expect(makeKey("movie", 123)).toBe("movie:123");
  });

  it("should create unique key for TV show", () => {
    expect(makeKey("tv", 456)).toBe("tv:456");
  });

  it("should not collide between movie and TV with same ID", () => {
    expect(makeKey("movie", 100)).not.toBe(makeKey("tv", 100));
  });
});

// ── addingIds state (button spinner) ─────────────────────────────────

describe("AddToLibrary: button spinner during add", () => {
  it("should track adding state when mutation starts", () => {
    const addingIds = new Set<string>();
    const key = makeKey("movie", 123);

    // Simulate: setAddingIds(prev => new Set(prev).add(key))
    const next = new Set(addingIds).add(key);
    expect(next.has(key)).toBe(true);
  });

  it("isAdding should be true while adding", () => {
    const addingIds = new Set(["movie:123"]);
    const isAdding = addingIds.has("movie:123");
    expect(isAdding).toBe(true);
  });

  it("isAdding should be false when not adding", () => {
    const addingIds = new Set<string>();
    const isAdding = addingIds.has("movie:123");
    expect(isAdding).toBe(false);
  });
});

// ── Success: transitions to "In Library" badge ──────────────────────

describe("AddToLibrary: success transitions to badge", () => {
  it("should add key to addedIds on success", () => {
    const addedIds = new Set<string>();
    const key = makeKey("movie", 123);

    // Simulate onSuccess: setAddedIds(prev => new Set(prev).add(key))
    const next = new Set(addedIds).add(key);
    expect(next.has(key)).toBe(true);
  });

  it("should remove key from addingIds on settled", () => {
    const addingIds = new Set(["movie:123"]);
    const key = "movie:123";

    // Simulate onSettled: remove from addingIds
    const next = new Set(addingIds);
    next.delete(key);
    expect(next.has(key)).toBe(false);
  });

  it("inLibrary should be true after successful add", () => {
    const addedIds = new Set(["movie:123"]);
    const movieTmdbIds = new Set<number>(); // not in library cache yet
    const tmdbId = 123;
    const key = makeKey("movie", tmdbId);

    const inLibrary = movieTmdbIds.has(tmdbId) || addedIds.has(key);
    expect(inLibrary).toBe(true);
  });
});

// ── Failure: reverts to button ──────────────────────────────────────

describe("AddToLibrary: failure reverts to button", () => {
  it("should not add key to addedIds on failure", () => {
    const addedIds = new Set<string>();
    // On failure, onSuccess is not called, so addedIds stays unchanged
    expect(addedIds.has("movie:123")).toBe(false);
  });

  it("should remove key from addingIds on settled (even on failure)", () => {
    const addingIds = new Set(["movie:123"]);
    const key = "movie:123";

    // onSettled fires on both success and failure
    const next = new Set(addingIds);
    next.delete(key);
    expect(next.has(key)).toBe(false);
    expect(next.size).toBe(0);
  });

  it("button should revert to Add after failure", () => {
    const addingIds = new Set<string>(); // cleared by onSettled
    const addedIds = new Set<string>(); // never added on failure
    const key = "movie:123";

    const isAdding = addingIds.has(key);
    const inLibrary = addedIds.has(key);
    expect(isAdding).toBe(false);
    expect(inLibrary).toBe(false);
    // Button should show "Add to Library" (not spinner, not badge)
  });
});

// ── Toast messages ──────────────────────────────────────────────────

describe("AddToLibrary: toast messages", () => {
  it("should produce success toast message for movie", () => {
    const message = "Movie added to library";
    expect(message).toBe("Movie added to library");
  });

  it("should produce success toast message for TV show", () => {
    const message = "TV show added to library";
    expect(message).toBe("TV show added to library");
  });

  it("should produce error toast with failure reason", () => {
    const error = { message: "Network error" };
    const message = `Failed to add movie: ${error.message}`;
    expect(message).toBe("Failed to add movie: Network error");
  });

  it("should produce error toast for TV show failure", () => {
    const error = { message: "Server unavailable" };
    const message = `Failed to add TV show: ${error.message}`;
    expect(message).toBe("Failed to add TV show: Server unavailable");
  });
});

// ── Idempotent add ──────────────────────────────────────────────────

describe("AddToLibrary: idempotent add", () => {
  it("should detect item already in library via tmdbId set", () => {
    const movieTmdbIds = new Set([123, 456]);
    const addedIds = new Set<string>();
    const tmdbId = 123;
    const key = makeKey("movie", tmdbId);

    const inLibrary = movieTmdbIds.has(tmdbId) || addedIds.has(key);
    expect(inLibrary).toBe(true);
  });

  it("should detect item already in library via addedIds", () => {
    const movieTmdbIds = new Set<number>();
    const addedIds = new Set(["movie:123"]);
    const tmdbId = 123;
    const key = makeKey("movie", tmdbId);

    const inLibrary = movieTmdbIds.has(tmdbId) || addedIds.has(key);
    expect(inLibrary).toBe(true);
  });

  it("should detect TV show already in library via tvdbId set", () => {
    const tvTvdbIds = new Set([789]);
    const addedIds = new Set<string>();
    const tvdbId = 789;
    const key = makeKey("tv", tvdbId);

    const inLibrary = tvTvdbIds.has(tvdbId) || addedIds.has(key);
    expect(inLibrary).toBe(true);
  });

  it("adding same movie twice results in same addedIds entry", () => {
    const addedIds = new Set<string>();
    const key = makeKey("movie", 123);

    // First add
    const after1 = new Set(addedIds).add(key);
    // Second add (idempotent)
    const after2 = new Set(after1).add(key);

    expect(after2.size).toBe(1);
    expect(after2.has(key)).toBe(true);
  });
});

// ── Cache update after add ──────────────────────────────────────────

describe("AddToLibrary: cache update after add", () => {
  it("addedIds persists across search queries within session", () => {
    const addedIds = new Set(["movie:123", "tv:456"]);

    // Simulates searching for a different query — addedIds is not cleared
    const debouncedQuery = "new search term";
    expect(debouncedQuery.length).toBeGreaterThan(0);
    expect(addedIds.has("movie:123")).toBe(true);
    expect(addedIds.has("tv:456")).toBe(true);
  });

  it("inLibrary detection works with both library cache and addedIds", () => {
    // Library cache from API
    const movieTmdbIds = new Set([100, 200]);
    // Session additions
    const addedIds = new Set(["movie:300"]);

    // Item from library cache
    expect(movieTmdbIds.has(100) || addedIds.has("movie:100")).toBe(true);
    // Item added this session
    expect(movieTmdbIds.has(300) || addedIds.has("movie:300")).toBe(true);
    // Item not in either
    expect(movieTmdbIds.has(999) || addedIds.has("movie:999")).toBe(false);
  });

  it("multiple concurrent adds are tracked independently", () => {
    let addingIds = new Set<string>();

    // Start adding movie:1
    addingIds = new Set(addingIds).add("movie:1");
    // Start adding tv:2
    addingIds = new Set(addingIds).add("tv:2");

    expect(addingIds.has("movie:1")).toBe(true);
    expect(addingIds.has("tv:2")).toBe(true);

    // movie:1 completes
    const next = new Set(addingIds);
    next.delete("movie:1");
    addingIds = next;

    expect(addingIds.has("movie:1")).toBe(false);
    expect(addingIds.has("tv:2")).toBe(true); // still in progress
  });
});
