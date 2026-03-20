import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestContext, seedWatchHistoryEntry } from "../../../shared/test-utils.js";
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

describe("listWatchHistory", () => {
  it("returns empty list when no entries exist", () => {
    const result = service.listWatchHistory({}, 50, 0);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns all entries with pagination", () => {
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 1 });
    seedWatchHistoryEntry(db, { media_type: "episode", media_id: 2 });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 3 });

    const result = service.listWatchHistory({}, 2, 0);
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("filters by mediaType", () => {
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 1 });
    seedWatchHistoryEntry(db, { media_type: "episode", media_id: 2 });

    const result = service.listWatchHistory({ mediaType: "movie" }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].mediaType).toBe("movie");
  });

  it("filters by mediaId", () => {
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 550 });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 551 });

    const result = service.listWatchHistory({ mediaId: 550 }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].mediaId).toBe(550);
  });

  it("filters by both mediaType and mediaId", () => {
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 550 });
    seedWatchHistoryEntry(db, { media_type: "episode", media_id: 550 });

    const result = service.listWatchHistory({ mediaType: "movie", mediaId: 550 }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].mediaType).toBe("movie");
  });
});

describe("getWatchHistoryEntry", () => {
  it("returns an entry by id", () => {
    const id = seedWatchHistoryEntry(db, { media_type: "movie", media_id: 550 });
    const entry = service.getWatchHistoryEntry(id);
    expect(entry.mediaType).toBe("movie");
    expect(entry.mediaId).toBe(550);
    expect(entry.completed).toBe(1);
  });

  it("throws NotFoundError for missing entry", () => {
    expect(() => service.getWatchHistoryEntry(999)).toThrow("WatchHistoryEntry");
  });
});

describe("logWatch", () => {
  it("logs a watch event with defaults", () => {
    const entry = service.logWatch({
      mediaType: "movie",
      mediaId: 550,
      completed: 1,
    });

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.mediaType).toBe("movie");
    expect(entry.mediaId).toBe(550);
    expect(entry.completed).toBe(1);
    expect(entry.watchedAt).toBeTruthy();
  });

  it("logs a watch event with custom values", () => {
    const entry = service.logWatch({
      mediaType: "episode",
      mediaId: 42,
      watchedAt: "2026-03-15T20:00:00.000Z",
      completed: 0,
    });

    expect(entry.mediaType).toBe("episode");
    expect(entry.watchedAt).toBe("2026-03-15T20:00:00.000Z");
    expect(entry.completed).toBe(0);
  });
});

describe("deleteWatchHistoryEntry", () => {
  it("deletes an existing entry", () => {
    const id = seedWatchHistoryEntry(db, { media_type: "movie", media_id: 550 });

    service.deleteWatchHistoryEntry(id);
    expect(() => service.getWatchHistoryEntry(id)).toThrow("WatchHistoryEntry");
  });

  it("throws NotFoundError for missing entry", () => {
    expect(() => service.deleteWatchHistoryEntry(999)).toThrow("WatchHistoryEntry");
  });
});
