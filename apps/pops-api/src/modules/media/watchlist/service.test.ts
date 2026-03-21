import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestContext, seedWatchlistEntry } from "../../../shared/test-utils.js";
import * as service from "./service.js";
import type { Database } from "better-sqlite3";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  const result = ctx.setup();
  db = result.db;
});

afterEach(() => {
  ctx.teardown();
});

describe("listWatchlist", () => {
  it("returns empty list when no entries exist", () => {
    const result = service.listWatchlist({}, 50, 0);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns all entries with pagination", () => {
    seedWatchlistEntry(db, { media_type: "movie", media_id: 1 });
    seedWatchlistEntry(db, { media_type: "tv_show", media_id: 2 });
    seedWatchlistEntry(db, { media_type: "movie", media_id: 3 });

    const result = service.listWatchlist({}, 2, 0);
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("filters by mediaType", () => {
    seedWatchlistEntry(db, { media_type: "movie", media_id: 1 });
    seedWatchlistEntry(db, { media_type: "tv_show", media_id: 2 });
    seedWatchlistEntry(db, { media_type: "movie", media_id: 3 });

    const result = service.listWatchlist({ mediaType: "movie" }, 50, 0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.mediaType === "movie")).toBe(true);
  });
});

describe("getWatchlistEntry", () => {
  it("returns an entry by id", () => {
    const id = seedWatchlistEntry(db, { media_type: "movie", media_id: 550, priority: 1 });
    const entry = service.getWatchlistEntry(id);
    expect(entry.mediaType).toBe("movie");
    expect(entry.mediaId).toBe(550);
    expect(entry.priority).toBe(1);
  });

  it("throws NotFoundError for missing entry", () => {
    expect(() => service.getWatchlistEntry(999)).toThrow("WatchlistEntry");
  });
});

describe("addToWatchlist", () => {
  it("creates a watchlist entry", () => {
    const entry = service.addToWatchlist({
      mediaType: "movie",
      mediaId: 550,
      priority: 2,
      notes: "Must watch",
    });

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.mediaType).toBe("movie");
    expect(entry.mediaId).toBe(550);
    expect(entry.priority).toBe(2);
    expect(entry.notes).toBe("Must watch");
  });

  it("sets default values for optional fields", () => {
    const entry = service.addToWatchlist({
      mediaType: "tv_show",
      mediaId: 100,
    });

    expect(entry.priority).toBe(0); // Drizzle schema default
    expect(entry.notes).toBeNull();
  });

  it("throws ConflictError on duplicate mediaType+mediaId", () => {
    service.addToWatchlist({ mediaType: "movie", mediaId: 550 });
    expect(() => service.addToWatchlist({ mediaType: "movie", mediaId: 550 })).toThrow(
      "already on the watchlist"
    );
  });
});

describe("updateWatchlistEntry", () => {
  it("updates specified fields only", () => {
    const id = seedWatchlistEntry(db, {
      media_type: "movie",
      media_id: 550,
      priority: 1,
      notes: "Original",
    });

    const updated = service.updateWatchlistEntry(id, { priority: 5 });
    expect(updated.priority).toBe(5);
    expect(updated.notes).toBe("Original"); // unchanged
  });

  it("throws NotFoundError for missing entry", () => {
    expect(() => service.updateWatchlistEntry(999, { priority: 1 })).toThrow("WatchlistEntry");
  });
});

describe("listWatchlist ordering", () => {
  it("orders by priority ASC then addedAt DESC", () => {
    seedWatchlistEntry(db, { media_type: "movie", media_id: 1, priority: 2 });
    seedWatchlistEntry(db, { media_type: "movie", media_id: 2, priority: 0 });
    seedWatchlistEntry(db, { media_type: "movie", media_id: 3, priority: 1 });

    const result = service.listWatchlist({}, 50, 0);
    expect(result.rows.map((r) => r.mediaId)).toEqual([2, 3, 1]);
  });
});

describe("reorderWatchlist", () => {
  it("batch-updates priorities for all items", () => {
    const id1 = seedWatchlistEntry(db, { media_type: "movie", media_id: 1, priority: 0 });
    const id2 = seedWatchlistEntry(db, { media_type: "movie", media_id: 2, priority: 1 });
    const id3 = seedWatchlistEntry(db, { media_type: "movie", media_id: 3, priority: 2 });

    service.reorderWatchlist([
      { id: id3, priority: 0 },
      { id: id1, priority: 1 },
      { id: id2, priority: 2 },
    ]);

    const result = service.listWatchlist({}, 50, 0);
    expect(result.rows.map((r) => r.mediaId)).toEqual([3, 1, 2]);
  });

  it("does nothing for empty array", () => {
    service.reorderWatchlist([]);
    // Should not throw
  });

  it("throws NotFoundError for missing IDs", () => {
    expect(() => service.reorderWatchlist([{ id: 999, priority: 0 }])).toThrow("WatchlistEntry");
  });

  it("throws ConflictError for duplicate priorities", () => {
    const id1 = seedWatchlistEntry(db, { media_type: "movie", media_id: 1, priority: 0 });
    const id2 = seedWatchlistEntry(db, { media_type: "movie", media_id: 2, priority: 1 });

    expect(() =>
      service.reorderWatchlist([
        { id: id1, priority: 0 },
        { id: id2, priority: 0 },
      ])
    ).toThrow("Duplicate priorities");
  });

  it("persists reorder across reads", () => {
    const id1 = seedWatchlistEntry(db, { media_type: "movie", media_id: 1, priority: 0 });
    const id2 = seedWatchlistEntry(db, { media_type: "movie", media_id: 2, priority: 1 });

    service.reorderWatchlist([
      { id: id2, priority: 0 },
      { id: id1, priority: 1 },
    ]);

    const entry1 = service.getWatchlistEntry(id1);
    const entry2 = service.getWatchlistEntry(id2);
    expect(entry1.priority).toBe(1);
    expect(entry2.priority).toBe(0);
  });
});

describe("removeFromWatchlist", () => {
  it("removes an existing entry", () => {
    const id = seedWatchlistEntry(db, { media_type: "movie", media_id: 550 });

    service.removeFromWatchlist(id);
    expect(() => service.getWatchlistEntry(id)).toThrow("WatchlistEntry");
  });

  it("throws NotFoundError for missing entry", () => {
    expect(() => service.removeFromWatchlist(999)).toThrow("WatchlistEntry");
  });
});
