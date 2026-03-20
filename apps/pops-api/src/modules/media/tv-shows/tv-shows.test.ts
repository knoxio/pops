import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
  seedTvShow,
  seedSeason,
  seedEpisode,
  createCaller,
} from "../../../shared/test-utils.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

// ── TV Shows CRUD ──

describe("tvShows.list", () => {
  it("returns empty list when no shows exist", async () => {
    const result = await caller.media.tvShows.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("returns shows sorted by name", async () => {
    seedTvShow(db, { tvdb_id: 1, name: "Breaking Bad" });
    seedTvShow(db, { tvdb_id: 2, name: "The Wire" });
    seedTvShow(db, { tvdb_id: 3, name: "Atlanta" });

    const result = await caller.media.tvShows.list({});
    expect(result.data).toHaveLength(3);
    expect(result.data[0].name).toBe("Atlanta");
    expect(result.data[1].name).toBe("Breaking Bad");
    expect(result.data[2].name).toBe("The Wire");
  });

  it("filters by search", async () => {
    seedTvShow(db, { tvdb_id: 1, name: "Breaking Bad" });
    seedTvShow(db, { tvdb_id: 2, name: "Better Call Saul" });
    seedTvShow(db, { tvdb_id: 3, name: "The Wire" });

    const result = await caller.media.tvShows.list({ search: "B" });
    expect(result.data).toHaveLength(2);
  });

  it("filters by status", async () => {
    seedTvShow(db, { tvdb_id: 1, name: "Breaking Bad", status: "Ended" });
    seedTvShow(db, { tvdb_id: 2, name: "Severance", status: "Returning Series" });

    const result = await caller.media.tvShows.list({ status: "Ended" });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("Breaking Bad");
  });

  it("supports pagination", async () => {
    for (let i = 1; i <= 5; i++) {
      seedTvShow(db, { tvdb_id: i, name: `Show ${i}` });
    }

    const result = await caller.media.tvShows.list({ limit: 2, offset: 0 });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(5);
    expect(result.pagination.hasMore).toBe(true);
  });
});

describe("tvShows.get", () => {
  it("returns a show by id", async () => {
    const showId = seedTvShow(db, {
      tvdb_id: 1396,
      name: "Breaking Bad",
      genres: '["Drama","Crime"]',
    });

    const result = await caller.media.tvShows.get({ id: showId });
    expect(result.data.name).toBe("Breaking Bad");
    expect(result.data.tvdbId).toBe(1396);
    expect(result.data.genres).toEqual(["Drama", "Crime"]);
  });

  it("throws NOT_FOUND for missing show", async () => {
    await expect(caller.media.tvShows.get({ id: 999 })).rejects.toThrow(TRPCError);
  });
});

describe("tvShows.create", () => {
  it("creates a new show", async () => {
    const result = await caller.media.tvShows.create({
      tvdbId: 1396,
      name: "Breaking Bad",
      status: "Ended",
      genres: ["Drama", "Crime"],
    });

    expect(result.data.name).toBe("Breaking Bad");
    expect(result.data.tvdbId).toBe(1396);
    expect(result.data.status).toBe("Ended");
    expect(result.data.genres).toEqual(["Drama", "Crime"]);
    expect(result.message).toBe("TV show created");
  });

  it("throws CONFLICT on duplicate tvdbId", async () => {
    seedTvShow(db, { tvdb_id: 1396, name: "Breaking Bad" });

    await expect(caller.media.tvShows.create({ tvdbId: 1396, name: "Duplicate" })).rejects.toThrow(
      TRPCError
    );
  });
});

describe("tvShows.update", () => {
  it("updates show fields", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Old Name" });

    const result = await caller.media.tvShows.update({
      id: showId,
      data: { name: "New Name", status: "Ended" },
    });
    expect(result.data.name).toBe("New Name");
    expect(result.data.status).toBe("Ended");
  });

  it("throws NOT_FOUND for missing show", async () => {
    await expect(caller.media.tvShows.update({ id: 999, data: { name: "X" } })).rejects.toThrow(
      TRPCError
    );
  });
});

describe("tvShows.delete", () => {
  it("deletes a show", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "To Delete" });

    const result = await caller.media.tvShows.delete({ id: showId });
    expect(result.message).toBe("TV show deleted");

    await expect(caller.media.tvShows.get({ id: showId })).rejects.toThrow(TRPCError);
  });

  it("throws NOT_FOUND for missing show", async () => {
    await expect(caller.media.tvShows.delete({ id: 999 })).rejects.toThrow(TRPCError);
  });

  it("cascades to seasons and episodes", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Cascade Test" });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 100, season_number: 1 });
    seedEpisode(db, { season_id: seasonId, tvdb_id: 200, episode_number: 1 });

    await caller.media.tvShows.delete({ id: showId });

    // Seasons and episodes should be gone (CASCADE)
    const seasonsLeft = db
      .prepare("SELECT count(*) as c FROM seasons WHERE tv_show_id = ?")
      .get(showId) as { c: number };
    expect(seasonsLeft.c).toBe(0);
    const episodesLeft = db
      .prepare("SELECT count(*) as c FROM episodes WHERE season_id = ?")
      .get(seasonId) as { c: number };
    expect(episodesLeft.c).toBe(0);
  });
});

// ── Seasons ──

describe("tvShows.listSeasons", () => {
  it("returns seasons for a show sorted by number", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    seedSeason(db, { tv_show_id: showId, tvdb_id: 102, season_number: 2 });
    seedSeason(db, { tv_show_id: showId, tvdb_id: 101, season_number: 1 });

    const result = await caller.media.tvShows.listSeasons({ tvShowId: showId });
    expect(result.data).toHaveLength(2);
    expect(result.data[0].seasonNumber).toBe(1);
    expect(result.data[1].seasonNumber).toBe(2);
  });

  it("throws NOT_FOUND for missing show", async () => {
    await expect(caller.media.tvShows.listSeasons({ tvShowId: 999 })).rejects.toThrow(TRPCError);
  });
});

describe("tvShows.createSeason", () => {
  it("creates a season", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });

    const result = await caller.media.tvShows.createSeason({
      tvShowId: showId,
      tvdbId: 500,
      seasonNumber: 1,
      name: "Season 1",
    });

    expect(result.data.seasonNumber).toBe(1);
    expect(result.data.name).toBe("Season 1");
    expect(result.data.tvShowId).toBe(showId);
  });

  it("throws NOT_FOUND for missing show", async () => {
    await expect(
      caller.media.tvShows.createSeason({
        tvShowId: 999,
        tvdbId: 500,
        seasonNumber: 1,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws CONFLICT on duplicate tvdbId", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    seedSeason(db, { tv_show_id: showId, tvdb_id: 500, season_number: 1 });

    await expect(
      caller.media.tvShows.createSeason({
        tvShowId: showId,
        tvdbId: 500,
        seasonNumber: 2,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws CONFLICT on duplicate season number for same show", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    seedSeason(db, { tv_show_id: showId, tvdb_id: 500, season_number: 1 });

    await expect(
      caller.media.tvShows.createSeason({
        tvShowId: showId,
        tvdbId: 501,
        seasonNumber: 1,
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("tvShows.deleteSeason", () => {
  it("deletes a season", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 100, season_number: 1 });

    const result = await caller.media.tvShows.deleteSeason({ id: seasonId });
    expect(result.message).toBe("Season deleted");
  });

  it("throws NOT_FOUND for missing season", async () => {
    await expect(caller.media.tvShows.deleteSeason({ id: 999 })).rejects.toThrow(TRPCError);
  });

  it("cascades to episodes", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 100, season_number: 1 });
    seedEpisode(db, { season_id: seasonId, tvdb_id: 200, episode_number: 1 });

    await caller.media.tvShows.deleteSeason({ id: seasonId });

    const episodesLeft = db
      .prepare("SELECT count(*) as c FROM episodes WHERE season_id = ?")
      .get(seasonId) as { c: number };
    expect(episodesLeft.c).toBe(0);
  });
});

// ── Episodes ──

describe("tvShows.listEpisodes", () => {
  it("returns episodes for a season sorted by number", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 100, season_number: 1 });
    seedEpisode(db, { season_id: seasonId, tvdb_id: 1003, episode_number: 3 });
    seedEpisode(db, { season_id: seasonId, tvdb_id: 1001, episode_number: 1 });
    seedEpisode(db, { season_id: seasonId, tvdb_id: 1002, episode_number: 2 });

    const result = await caller.media.tvShows.listEpisodes({ seasonId });
    expect(result.data).toHaveLength(3);
    expect(result.data[0].episodeNumber).toBe(1);
    expect(result.data[1].episodeNumber).toBe(2);
    expect(result.data[2].episodeNumber).toBe(3);
  });

  it("throws NOT_FOUND for missing season", async () => {
    await expect(caller.media.tvShows.listEpisodes({ seasonId: 999 })).rejects.toThrow(TRPCError);
  });
});

describe("tvShows.createEpisode", () => {
  it("creates an episode", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 100, season_number: 1 });

    const result = await caller.media.tvShows.createEpisode({
      seasonId,
      tvdbId: 2000,
      episodeNumber: 1,
      name: "Pilot",
      runtime: 58,
    });

    expect(result.data.episodeNumber).toBe(1);
    expect(result.data.name).toBe("Pilot");
    expect(result.data.runtime).toBe(58);
    expect(result.data.seasonId).toBe(seasonId);
  });

  it("throws NOT_FOUND for missing season", async () => {
    await expect(
      caller.media.tvShows.createEpisode({
        seasonId: 999,
        tvdbId: 2000,
        episodeNumber: 1,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws CONFLICT on duplicate tvdbId", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 100, season_number: 1 });
    seedEpisode(db, { season_id: seasonId, tvdb_id: 2000, episode_number: 1 });

    await expect(
      caller.media.tvShows.createEpisode({
        seasonId,
        tvdbId: 2000,
        episodeNumber: 2,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws CONFLICT on duplicate episode number for same season", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 100, season_number: 1 });
    seedEpisode(db, { season_id: seasonId, tvdb_id: 2000, episode_number: 1 });

    await expect(
      caller.media.tvShows.createEpisode({
        seasonId,
        tvdbId: 2001,
        episodeNumber: 1,
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("tvShows.deleteEpisode", () => {
  it("deletes an episode", async () => {
    const showId = seedTvShow(db, { tvdb_id: 1, name: "Test" });
    const seasonId = seedSeason(db, { tv_show_id: showId, tvdb_id: 100, season_number: 1 });
    const episodeId = seedEpisode(db, { season_id: seasonId, tvdb_id: 200, episode_number: 1 });

    const result = await caller.media.tvShows.deleteEpisode({ id: episodeId });
    expect(result.message).toBe("Episode deleted");
  });

  it("throws NOT_FOUND for missing episode", async () => {
    await expect(caller.media.tvShows.deleteEpisode({ id: 999 })).rejects.toThrow(TRPCError);
  });
});

// ── Auth ──

describe("tvShows auth", () => {
  it("rejects unauthenticated calls", async () => {
    const anonCaller = createCaller(false);
    await expect(anonCaller.media.tvShows.list({})).rejects.toThrow(TRPCError);
  });
});
