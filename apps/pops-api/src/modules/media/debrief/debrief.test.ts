import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
  seedMovie,
  seedDimension,
  seedWatchHistoryEntry,
} from "../../../shared/test-utils.js";
import { createDebriefSession, getDebrief, queueDebriefStatus } from "./service.js";
import * as watchHistoryService from "../watch-history/service.js";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

function getDebriefSessions(db: Database) {
  return db.prepare("SELECT * FROM debrief_sessions ORDER BY id").all() as Array<{
    id: number;
    watch_history_id: number;
    status: string;
    created_at: string;
  }>;
}

describe("debrief auto-queue", () => {
  describe("createDebriefSession", () => {
    it("creates a pending session for a watch history entry", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      const whId = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
      });

      const sessionId = createDebriefSession(whId);

      expect(sessionId).toBeGreaterThan(0);
      const sessions = getDebriefSessions(db);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.watch_history_id).toBe(whId);
      expect(sessions[0]!.status).toBe("pending");
    });

    it("re-watch deletes existing pending session and creates new one", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      const wh1 = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        watched_at: "2026-01-01T00:00:00.000Z",
      });
      createDebriefSession(wh1);

      // Re-watch creates a new watch history entry
      const wh2 = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        watched_at: "2026-02-01T00:00:00.000Z",
      });
      const newSessionId = createDebriefSession(wh2);

      const sessions = getDebriefSessions(db);
      // Only the new session should remain (old pending was deleted)
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.id).toBe(newSessionId);
      expect(sessions[0]!.watch_history_id).toBe(wh2);
    });

    it("preserves completed sessions on re-watch", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      const wh1 = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        watched_at: "2026-01-01T00:00:00.000Z",
      });
      createDebriefSession(wh1);
      // Manually mark as complete
      db.prepare("UPDATE debrief_sessions SET status = 'complete' WHERE watch_history_id = ?").run(
        wh1
      );

      // Re-watch
      const wh2 = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        watched_at: "2026-02-01T00:00:00.000Z",
      });
      createDebriefSession(wh2);

      const sessions = getDebriefSessions(db);
      // Should have 2: the completed one from first watch + new pending
      expect(sessions).toHaveLength(2);
      expect(sessions[0]!.status).toBe("complete");
      expect(sessions[1]!.status).toBe("pending");
    });
  });

  describe("getDebrief", () => {
    it("returns session with movie info and pending dimensions", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      const dimId = seedDimension(db, { name: "Enjoyment" });
      const whId = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
      });
      const sessionId = createDebriefSession(whId);

      const result = getDebrief(sessionId);

      expect(result.sessionId).toBe(sessionId);
      expect(result.status).toBe("active"); // transitions from pending
      expect(result.movie.title).toBe("The Matrix");
      expect(result.movie.mediaType).toBe("movie");
      expect(result.movie.mediaId).toBe(1);
      expect(result.dimensions).toHaveLength(1);
      expect(result.dimensions[0]!.dimensionId).toBe(dimId);
      expect(result.dimensions[0]!.name).toBe("Enjoyment");
      expect(result.dimensions[0]!.status).toBe("pending");
      expect(result.dimensions[0]!.comparisonId).toBeNull();
    });

    it("transitions pending session to active on first read", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      const whId = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
      });
      const sessionId = createDebriefSession(whId);

      // First read: transitions pending → active
      const result1 = getDebrief(sessionId);
      expect(result1.status).toBe("active");

      // Second read: stays active
      const result2 = getDebrief(sessionId);
      expect(result2.status).toBe("active");
    });

    it("marks dimension as complete when debrief_result exists", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      seedMovie(db, { title: "Inception", tmdb_id: 200 });
      const dimId = seedDimension(db, { name: "Enjoyment" });
      const whId = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
      });
      const sessionId = createDebriefSession(whId);

      // Create a real comparison to satisfy FK constraint
      const compId = db
        .prepare(
          `INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id)
           VALUES (?, 'movie', 1, 'movie', 2, 'movie', 1)`
        )
        .run(dimId).lastInsertRowid as number;

      // Insert a debrief result for this dimension
      db.prepare(
        "INSERT INTO debrief_results (session_id, dimension_id, comparison_id) VALUES (?, ?, ?)"
      ).run(sessionId, dimId, compId);

      const result = getDebrief(sessionId);

      expect(result.dimensions).toHaveLength(1);
      expect(result.dimensions[0]!.status).toBe("complete");
      expect(result.dimensions[0]!.comparisonId).toBe(Number(compId));
    });

    it("throws NotFoundError for non-existent session", () => {
      expect(() => getDebrief(999)).toThrow("Debrief session '999' not found");
    });

    it("only includes active dimensions", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      seedDimension(db, { name: "Active Dim", active: 1 });
      seedDimension(db, { name: "Inactive Dim", active: 0 });
      const whId = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
      });
      const sessionId = createDebriefSession(whId);

      const result = getDebrief(sessionId);

      expect(result.dimensions).toHaveLength(1);
      expect(result.dimensions[0]!.name).toBe("Active Dim");
    });
  });

  describe("queueDebriefStatus", () => {
    function getDebriefStatusRows(db: Database) {
      return db.prepare("SELECT * FROM debrief_status ORDER BY id").all() as Array<{
        id: number;
        media_type: string;
        media_id: number;
        dimension_id: number;
        debriefed: number;
        dismissed: number;
        created_at: string;
        updated_at: string;
      }>;
    }

    it("creates one row per active dimension", () => {
      seedDimension(db, { name: "Enjoyment", active: 1 });
      seedDimension(db, { name: "Cinematography", active: 1 });
      seedDimension(db, { name: "Inactive", active: 0 });

      const count = queueDebriefStatus("movie", 1);

      expect(count).toBe(2);
      const rows = getDebriefStatusRows(db);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.media_type).toBe("movie");
      expect(rows[0]!.media_id).toBe(1);
      expect(rows[0]!.debriefed).toBe(0);
      expect(rows[0]!.dismissed).toBe(0);
    });

    it("returns 0 when no active dimensions exist", () => {
      seedDimension(db, { name: "Inactive", active: 0 });

      const count = queueDebriefStatus("movie", 1);

      expect(count).toBe(0);
      expect(getDebriefStatusRows(db)).toHaveLength(0);
    });

    it("re-watch resets debriefed and dismissed to 0", () => {
      seedDimension(db, { name: "Enjoyment", active: 1 });

      queueDebriefStatus("movie", 1);

      // Simulate completed debrief
      db.prepare("UPDATE debrief_status SET debriefed = 1, dismissed = 1 WHERE media_id = 1").run();
      const before = getDebriefStatusRows(db);
      expect(before[0]!.debriefed).toBe(1);
      expect(before[0]!.dismissed).toBe(1);

      // Re-watch: should reset
      queueDebriefStatus("movie", 1);

      const after = getDebriefStatusRows(db);
      expect(after).toHaveLength(1); // still one row (upsert)
      expect(after[0]!.debriefed).toBe(0);
      expect(after[0]!.dismissed).toBe(0);
    });
  });

  describe("logWatch integration", () => {
    it("creates a debrief session when logging a completed watch", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });

      watchHistoryService.logWatch({
        mediaType: "movie",
        mediaId: 1,
        completed: 1,
      });

      const sessions = getDebriefSessions(db);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.status).toBe("pending");
    });

    it("does not create a debrief session for incomplete watches", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });

      watchHistoryService.logWatch({
        mediaType: "movie",
        mediaId: 1,
        completed: 0,
      });

      const sessions = getDebriefSessions(db);
      expect(sessions).toHaveLength(0);
    });

    it("queues debrief status rows when logging a completed watch", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      seedDimension(db, { name: "Enjoyment", active: 1 });
      seedDimension(db, { name: "Cinematography", active: 1 });

      watchHistoryService.logWatch({
        mediaType: "movie",
        mediaId: 1,
        completed: 1,
      });

      const rows = db
        .prepare("SELECT * FROM debrief_status WHERE media_type = 'movie' AND media_id = 1")
        .all() as Array<{ dimension_id: number }>;
      expect(rows).toHaveLength(2);
    });

    it("does not queue debrief status for incomplete watches", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      seedDimension(db, { name: "Enjoyment", active: 1 });

      watchHistoryService.logWatch({
        mediaType: "movie",
        mediaId: 1,
        completed: 0,
      });

      const rows = db.prepare("SELECT * FROM debrief_status").all();
      expect(rows).toHaveLength(0);
    });

    it("does not create a debrief session for blacklisted watch events", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      // Seed a blacklisted entry at the same timestamp
      seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        blacklisted: 1,
        watched_at: "2026-03-01T00:00:00.000Z",
      });

      // Try to log at the same timestamp — should be blocked by blacklist check
      watchHistoryService.logWatch({
        mediaType: "movie",
        mediaId: 1,
        completed: 1,
        watchedAt: "2026-03-01T00:00:00.000Z",
      });

      const sessions = getDebriefSessions(db);
      expect(sessions).toHaveLength(0);
    });
  });
});
