import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  setupTestContext,
  seedWatchHistoryEntry,
  seedWatchlistEntry,
  seedTvShow,
  seedSeason,
  seedEpisode,
} from "../../../shared/test-utils.js";
import * as service from "./service.js";
import * as watchlistService from "../watchlist/service.js";
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

describe("getProgress", () => {
  it("throws NotFoundError for non-existent TV show", () => {
    expect(() => service.getProgress(999)).toThrow("TvShow");
  });

  it("returns zero progress for a show with no episodes", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Empty Show" });

    const progress = service.getProgress(showId);
    expect(progress.tvShowId).toBe(showId);
    expect(progress.overall).toEqual({ watched: 0, total: 0, percentage: 0 });
    expect(progress.seasons).toHaveLength(0);
  });

  it("returns zero progress when no episodes are watched", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const progress = service.getProgress(showId);
    expect(progress.overall).toEqual({ watched: 0, total: 2, percentage: 0 });
    expect(progress.seasons).toHaveLength(1);
    expect(progress.seasons[0]).toEqual({
      seasonId: sId,
      seasonNumber: 1,
      watched: 0,
      total: 2,
      percentage: 0,
    });
  });

  it("returns correct progress with partial watches", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });

    const progress = service.getProgress(showId);
    expect(progress.overall).toEqual({ watched: 1, total: 2, percentage: 50 });
    expect(progress.seasons[0].watched).toBe(1);
    expect(progress.seasons[0].percentage).toBe(50);
  });

  it("returns 100% when all episodes are watched", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: "episode", mediaId: ep2, completed: 1 });

    const progress = service.getProgress(showId);
    expect(progress.overall).toEqual({ watched: 2, total: 2, percentage: 100 });
  });

  it("returns per-season progress across multiple seasons", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    const ep1 = seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: s1Id, tvdb_id: 5002, episode_number: 2 });
    const ep3 = seedEpisode(db, { season_id: s2Id, tvdb_id: 5003, episode_number: 1 });
    seedEpisode(db, { season_id: s2Id, tvdb_id: 5004, episode_number: 2 });

    // Watch all of season 1 and one of season 2
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: "episode", mediaId: ep2, completed: 1 });
    service.logWatch({ mediaType: "episode", mediaId: ep3, completed: 1 });

    const progress = service.getProgress(showId);
    expect(progress.overall).toEqual({ watched: 3, total: 4, percentage: 75 });
    expect(progress.seasons).toHaveLength(2);
    expect(progress.seasons[0]).toEqual({
      seasonId: s1Id,
      seasonNumber: 1,
      watched: 2,
      total: 2,
      percentage: 100,
    });
    expect(progress.seasons[1]).toEqual({
      seasonId: s2Id,
      seasonNumber: 2,
      watched: 1,
      total: 2,
      percentage: 50,
    });
  });

  it("does not double-count rewatched episodes", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    // Watch ep1 three times
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });

    const progress = service.getProgress(showId);
    expect(progress.overall.watched).toBe(1);
    expect(progress.seasons[0].watched).toBe(1);
  });

  it("ignores incomplete watches", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });

    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 0 });

    const progress = service.getProgress(showId);
    expect(progress.overall.watched).toBe(0);
  });
});

describe("auto-remove from watchlist (PRD-011 R6)", () => {
  it("removes movie from watchlist when marked as watched", () => {
    // Add movie 550 to watchlist
    const wlId = seedWatchlistEntry(db, { media_type: "movie", media_id: 550 });

    // Log watch → should auto-remove from watchlist
    service.logWatch({ mediaType: "movie", mediaId: 550, completed: 1 });

    // Watchlist entry should be gone
    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow("WatchlistEntry");
  });

  it("does not remove movie from watchlist when watch is incomplete", () => {
    const wlId = seedWatchlistEntry(db, { media_type: "movie", media_id: 550 });

    service.logWatch({ mediaType: "movie", mediaId: 550, completed: 0 });

    // Watchlist entry should still exist
    const entry = watchlistService.getWatchlistEntry(wlId);
    expect(entry.mediaId).toBe(550);
  });

  it("does not error when movie is not on watchlist", () => {
    // Log watch without any watchlist entry — should not throw
    expect(() => {
      service.logWatch({ mediaType: "movie", mediaId: 999, completed: 1 });
    }).not.toThrow();
  });

  it("removes TV show from watchlist when all episodes are watched", () => {
    // Create a show with 2 seasons, 2 episodes each
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    const ep1 = seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: s1Id, tvdb_id: 5002, episode_number: 2 });
    const ep3 = seedEpisode(db, { season_id: s2Id, tvdb_id: 5003, episode_number: 1 });
    const ep4 = seedEpisode(db, { season_id: s2Id, tvdb_id: 5004, episode_number: 2 });

    // Add show to watchlist
    const wlId = seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

    // Watch first 3 episodes — show should stay on watchlist
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: "episode", mediaId: ep2, completed: 1 });
    service.logWatch({ mediaType: "episode", mediaId: ep3, completed: 1 });

    const stillThere = watchlistService.getWatchlistEntry(wlId);
    expect(stillThere.mediaId).toBe(showId);

    // Watch final episode → show should be removed from watchlist
    service.logWatch({ mediaType: "episode", mediaId: ep4, completed: 1 });

    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow("WatchlistEntry");
  });

  it("does not remove TV show when individual episode is watched", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const wlId = seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

    // Watch only one of two episodes
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });

    const entry = watchlistService.getWatchlistEntry(wlId);
    expect(entry.mediaId).toBe(showId);
  });

  it("handles episode not in database gracefully", () => {
    // Log watch for an episode ID that doesn't exist in episodes table
    expect(() => {
      service.logWatch({ mediaType: "episode", mediaId: 99999, completed: 1 });
    }).not.toThrow();
  });

  it("allows re-watch after removal — movie can be re-added and re-watched", () => {
    // Add movie, watch it (auto-removed), re-add, re-watch
    seedWatchlistEntry(db, { media_type: "movie", media_id: 550 });
    service.logWatch({ mediaType: "movie", mediaId: 550, completed: 1 });

    // Re-add to watchlist
    const wl2 = seedWatchlistEntry(db, { media_type: "movie", media_id: 550 });

    // Re-watch → should auto-remove again
    service.logWatch({ mediaType: "movie", mediaId: 550, completed: 1 });
    expect(() => watchlistService.getWatchlistEntry(wl2)).toThrow("WatchlistEntry");
  });

  it("handles duplicate episode watch — does not double-count", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    const ep2 = seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const wlId = seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

    // Watch ep1 twice — should not count as both episodes watched
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });

    // Show should still be on watchlist (ep2 unwatched)
    const entry = watchlistService.getWatchlistEntry(wlId);
    expect(entry.mediaId).toBe(showId);

    // Watch ep2 → now all episodes watched, should remove
    service.logWatch({ mediaType: "episode", mediaId: ep2, completed: 1 });
    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow("WatchlistEntry");
  });
});

describe("batchLogWatch", () => {
  it("logs all episodes in a season", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5003, episode_number: 3 });

    const result = service.batchLogWatch({ mediaType: "season", mediaId: sId, completed: 1 });

    expect(result.logged).toBe(3);
    expect(result.skipped).toBe(0);

    // Verify entries exist
    const history = service.listWatchHistory({ mediaType: "episode" }, 50, 0);
    expect(history.total).toBe(3);
  });

  it("logs all episodes across all seasons of a show", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: s1Id, tvdb_id: 5002, episode_number: 2 });
    seedEpisode(db, { season_id: s2Id, tvdb_id: 5003, episode_number: 1 });

    const result = service.batchLogWatch({ mediaType: "show", mediaId: showId, completed: 1 });

    expect(result.logged).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it("skips already-watched episodes", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    // Watch ep1 individually first
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });

    // Batch log the whole season — ep1 should be skipped
    const result = service.batchLogWatch({ mediaType: "season", mediaId: sId, completed: 1 });

    expect(result.logged).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("returns zeros for empty season", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    // No episodes added

    const result = service.batchLogWatch({ mediaType: "season", mediaId: sId, completed: 1 });

    expect(result.logged).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("returns zeros for non-existent show", () => {
    const result = service.batchLogWatch({ mediaType: "show", mediaId: 99999, completed: 1 });

    expect(result.logged).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("removes TV show from watchlist when all episodes batch-logged for show", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const wlId = seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

    service.batchLogWatch({ mediaType: "show", mediaId: showId, completed: 1 });

    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow("WatchlistEntry");
  });

  it("removes TV show from watchlist when all episodes batch-logged for season (single season show)", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const wlId = seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

    service.batchLogWatch({ mediaType: "season", mediaId: sId, completed: 1 });

    expect(() => watchlistService.getWatchlistEntry(wlId)).toThrow("WatchlistEntry");
  });

  it("does not remove TV show from watchlist when only one season batch-logged (multi-season)", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const s1Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const s2Id = seedSeason(db, { tv_show_id: showId, tvdb_id: 3002, season_number: 2 });
    seedEpisode(db, { season_id: s1Id, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: s2Id, tvdb_id: 5002, episode_number: 1 });

    const wlId = seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

    // Only batch log season 1
    service.batchLogWatch({ mediaType: "season", mediaId: s1Id, completed: 1 });

    // Show should still be on watchlist
    const entry = watchlistService.getWatchlistEntry(wlId);
    expect(entry.mediaId).toBe(showId);
  });

  it("uses custom watchedAt for all entries", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    const customDate = "2026-03-01T12:00:00.000Z";
    service.batchLogWatch({ mediaType: "season", mediaId: sId, watchedAt: customDate, completed: 1 });

    const history = service.listWatchHistory({ mediaType: "episode" }, 50, 0);
    for (const row of history.rows) {
      expect(row.watchedAt).toBe(customDate);
    }
  });

  it("does not skip when completed is 0 (re-logging incomplete watches)", () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Test Show" });
    const sId = seedSeason(db, { tv_show_id: showId, tvdb_id: 3001, season_number: 1 });
    const ep1 = seedEpisode(db, { season_id: sId, tvdb_id: 5001, episode_number: 1 });
    seedEpisode(db, { season_id: sId, tvdb_id: 5002, episode_number: 2 });

    // Watch ep1 as completed
    service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });

    // Batch log with completed=0 — should not skip any (different semantics)
    const result = service.batchLogWatch({ mediaType: "season", mediaId: sId, completed: 0 });

    expect(result.logged).toBe(2);
    expect(result.skipped).toBe(0);
  });
});
