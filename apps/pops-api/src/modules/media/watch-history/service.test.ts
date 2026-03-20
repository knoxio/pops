import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  setupTestContext,
  seedWatchHistoryEntry,
  seedWatchlistEntry,
  seedMovie,
  seedTvShow,
  seedSeason,
  seedEpisode,
} from "../../../shared/test-utils.js";
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

describe("auto-remove from watchlist", () => {
  describe("movies", () => {
    it("removes movie from watchlist when watched (completed=1)", () => {
      const movieId = seedMovie(db, { tmdb_id: 550, title: "Fight Club" });
      seedWatchlistEntry(db, { media_type: "movie", media_id: movieId });

      service.logWatch({ mediaType: "movie", mediaId: movieId, completed: 1 });

      const row = db
        .prepare("SELECT * FROM watchlist WHERE media_type = 'movie' AND media_id = ?")
        .get(movieId);
      expect(row).toBeUndefined();
    });

    it("does NOT remove movie from watchlist when incomplete (completed=0)", () => {
      const movieId = seedMovie(db, { tmdb_id: 551, title: "Inception" });
      seedWatchlistEntry(db, { media_type: "movie", media_id: movieId });

      service.logWatch({ mediaType: "movie", mediaId: movieId, completed: 0 });

      const row = db
        .prepare("SELECT * FROM watchlist WHERE media_type = 'movie' AND media_id = ?")
        .get(movieId);
      expect(row).toBeDefined();
    });

    it("no-ops when movie is not on watchlist", () => {
      const movieId = seedMovie(db, { tmdb_id: 552, title: "Arrival" });

      // Should not throw
      const entry = service.logWatch({ mediaType: "movie", mediaId: movieId, completed: 1 });
      expect(entry.id).toBeGreaterThan(0);
    });
  });

  describe("TV shows", () => {
    function createShowWithEpisodes(episodeCount: number) {
      const showId = seedTvShow(db, { tvdb_id: 100, name: "Test Show" });
      const seasonId = seedSeason(db, {
        tv_show_id: showId,
        tvdb_id: 200,
        season_number: 1,
        episode_count: episodeCount,
      });

      const episodeIds: number[] = [];
      for (let i = 1; i <= episodeCount; i++) {
        const epId = seedEpisode(db, {
          season_id: seasonId,
          tvdb_id: 300 + i,
          episode_number: i,
        });
        episodeIds.push(epId);
      }

      return { showId, seasonId, episodeIds };
    }

    it("removes show from watchlist when all episodes watched", () => {
      const { showId, episodeIds } = createShowWithEpisodes(3);
      seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

      // Watch all 3 episodes
      for (const epId of episodeIds) {
        service.logWatch({ mediaType: "episode", mediaId: epId, completed: 1 });
      }

      const row = db
        .prepare("SELECT * FROM watchlist WHERE media_type = 'tv_show' AND media_id = ?")
        .get(showId);
      expect(row).toBeUndefined();
    });

    it("does NOT remove show when only some episodes watched", () => {
      const { showId, episodeIds } = createShowWithEpisodes(3);
      seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

      // Watch only 2 of 3 episodes
      service.logWatch({ mediaType: "episode", mediaId: episodeIds[0], completed: 1 });
      service.logWatch({ mediaType: "episode", mediaId: episodeIds[1], completed: 1 });

      const row = db
        .prepare("SELECT * FROM watchlist WHERE media_type = 'tv_show' AND media_id = ?")
        .get(showId);
      expect(row).toBeDefined();
    });

    it("does NOT remove show when episode watched as incomplete", () => {
      const { showId, episodeIds } = createShowWithEpisodes(1);
      seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

      service.logWatch({ mediaType: "episode", mediaId: episodeIds[0], completed: 0 });

      const row = db
        .prepare("SELECT * FROM watchlist WHERE media_type = 'tv_show' AND media_id = ?")
        .get(showId);
      expect(row).toBeDefined();
    });

    it("no-ops when show is not on watchlist", () => {
      const { episodeIds } = createShowWithEpisodes(1);

      // Should not throw
      const entry = service.logWatch({
        mediaType: "episode",
        mediaId: episodeIds[0],
        completed: 1,
      });
      expect(entry.id).toBeGreaterThan(0);
    });

    it("handles multi-season shows correctly", () => {
      const showId = seedTvShow(db, { tvdb_id: 101, name: "Multi Season Show" });
      const s1 = seedSeason(db, { tv_show_id: showId, tvdb_id: 201, season_number: 1 });
      const s2 = seedSeason(db, { tv_show_id: showId, tvdb_id: 202, season_number: 2 });

      const ep1 = seedEpisode(db, { season_id: s1, tvdb_id: 401, episode_number: 1 });
      const ep2 = seedEpisode(db, { season_id: s1, tvdb_id: 402, episode_number: 2 });
      const ep3 = seedEpisode(db, { season_id: s2, tvdb_id: 403, episode_number: 1 });

      seedWatchlistEntry(db, { media_type: "tv_show", media_id: showId });

      // Watch season 1 only
      service.logWatch({ mediaType: "episode", mediaId: ep1, completed: 1 });
      service.logWatch({ mediaType: "episode", mediaId: ep2, completed: 1 });

      // Still on watchlist — season 2 not complete
      let row = db
        .prepare("SELECT * FROM watchlist WHERE media_type = 'tv_show' AND media_id = ?")
        .get(showId);
      expect(row).toBeDefined();

      // Watch final episode
      service.logWatch({ mediaType: "episode", mediaId: ep3, completed: 1 });

      // Now removed
      row = db
        .prepare("SELECT * FROM watchlist WHERE media_type = 'tv_show' AND media_id = ?")
        .get(showId);
      expect(row).toBeUndefined();
    });
  });
});
