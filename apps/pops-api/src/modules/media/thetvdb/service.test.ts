/**
 * TheTVDB service unit tests — refreshTvShow with mocked TheTVDB client.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
  seedTvShow,
  seedSeason,
  seedEpisode,
} from "../../../shared/test-utils.js";
import { refreshTvShow } from "./service.js";
import type { TheTvdbClient } from "./client.js";
import type { TvdbShowDetail, TvdbEpisode } from "./types.js";
import type { ImageCacheService } from "../tmdb/image-cache.js";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

/** Create a mock TheTVDB client. */
function createMockClient(
  detail: TvdbShowDetail,
  episodesBySeason: Record<number, TvdbEpisode[]> = {}
): TheTvdbClient {
  return {
    getSeriesExtended: vi.fn().mockResolvedValue(detail),
    getSeriesEpisodes: vi.fn().mockImplementation((_tvdbId: number, seasonNumber: number) => {
      const eps = episodesBySeason[seasonNumber];
      if (eps) return Promise.resolve(eps);
      return Promise.resolve([]);
    }),
    searchSeries: vi.fn(),
  } as unknown as TheTvdbClient;
}

/** Build a TvdbShowDetail fixture. */
function makeShowDetail(overrides: Partial<TvdbShowDetail> = {}): TvdbShowDetail {
  return {
    tvdbId: 81189,
    name: "Breaking Bad",
    originalName: null,
    overview: "A chemistry teacher turned meth cook.",
    firstAirDate: "2008-01-20",
    lastAirDate: "2013-09-29",
    status: "Ended",
    originalLanguage: "eng",
    averageRuntime: 47,
    genres: [
      { id: 1, name: "Drama" },
      { id: 2, name: "Thriller" },
    ],
    networks: [{ id: 1, name: "AMC" }],
    seasons: [],
    artworks: [],
    ...overrides,
  };
}

/** Build a TvdbEpisode fixture. */
function makeEpisode(overrides: Partial<TvdbEpisode> = {}): TvdbEpisode {
  return {
    tvdbId: 1000,
    episodeNumber: 1,
    seasonNumber: 1,
    name: "Pilot",
    overview: "A pilot episode.",
    airDate: "2008-01-20",
    runtime: 58,
    imageUrl: null,
    ...overrides,
  };
}

// ── Tests ──

describe("refreshTvShow", () => {
  it("updates show metadata from TheTVDB", async () => {
    const showId = seedTvShow(db, {
      tvdb_id: 81189,
      name: "Breaking Bad (old)",
      status: "Continuing",
      genres: '["Crime"]',
    });

    const detail = makeShowDetail({
      name: "Breaking Bad",
      status: "Ended",
    });
    const client = createMockClient(detail);

    const result = await refreshTvShow(client, {
      id: showId,
      refreshEpisodes: false,
    });

    expect(result.show.name).toBe("Breaking Bad");
    expect(result.show.status).toBe("Ended");
    expect(result.show.episodeRunTime).toBe(47);
  });

  it("preserves poster_override_path on refresh", async () => {
    const showId = seedTvShow(db, {
      tvdb_id: 81189,
      name: "Breaking Bad",
      poster_override_path: "/custom/poster.jpg",
    });

    const detail = makeShowDetail();
    const client = createMockClient(detail);

    const result = await refreshTvShow(client, {
      id: showId,
      refreshEpisodes: false,
    });

    expect(result.show.posterOverridePath).toBe("/custom/poster.jpg");
  });

  it("inserts new seasons and episodes on refresh", async () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Breaking Bad" });

    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 5001,
          seasonNumber: 1,
          name: "Season 1",
          overview: null,
          imageUrl: null,
          episodeCount: 2,
        },
      ],
    });
    const episodesBySeason: Record<number, TvdbEpisode[]> = {
      1: [
        makeEpisode({ tvdbId: 6001, episodeNumber: 1, name: "Pilot" }),
        makeEpisode({
          tvdbId: 6002,
          episodeNumber: 2,
          name: "Cat's in the Bag...",
        }),
      ],
    };
    const client = createMockClient(detail, episodesBySeason);

    const result = await refreshTvShow(client, { id: showId });

    expect(result.seasonsAdded).toBe(1);
    expect(result.episodesAdded).toBe(2);
    expect(result.seasonsUpdated).toBe(0);
    expect(result.episodesUpdated).toBe(0);
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]!.name).toBe("Season 1");
  });

  it("updates existing episodes without deleting any", async () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Breaking Bad" });
    const seasonId = seedSeason(db, {
      tv_show_id: showId,
      tvdb_id: 5001,
      season_number: 1,
      name: "Season 1",
    });
    seedEpisode(db, {
      season_id: seasonId,
      tvdb_id: 6001,
      episode_number: 1,
      name: "Old Pilot Name",
    });
    // Episode that won't be in TheTVDB response — should NOT be deleted
    seedEpisode(db, {
      season_id: seasonId,
      tvdb_id: 6099,
      episode_number: 99,
      name: "Bonus Episode",
    });

    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 5001,
          seasonNumber: 1,
          name: "Season 1 Updated",
          overview: null,
          imageUrl: null,
          episodeCount: 2,
        },
      ],
    });
    const episodesBySeason: Record<number, TvdbEpisode[]> = {
      1: [
        makeEpisode({
          tvdbId: 6001,
          episodeNumber: 1,
          name: "Pilot (Updated)",
        }),
        makeEpisode({ tvdbId: 6002, episodeNumber: 2, name: "New Episode" }),
      ],
    };
    const client = createMockClient(detail, episodesBySeason);

    const result = await refreshTvShow(client, { id: showId });

    expect(result.seasonsUpdated).toBe(1);
    expect(result.seasonsAdded).toBe(0);
    expect(result.episodesUpdated).toBe(1);
    expect(result.episodesAdded).toBe(1);

    // Verify the bonus episode was NOT deleted
    const allEpisodes = db.prepare("SELECT * FROM episodes WHERE season_id = ?").all(seasonId) as {
      tvdb_id: number;
      name: string;
    }[];
    expect(allEpisodes).toHaveLength(3);
    const bonusEp = allEpisodes.find((e) => e.tvdb_id === 6099);
    expect(bonusEp).toBeDefined();
    expect(bonusEp?.name).toBe("Bonus Episode");

    // Verify updated episode has new name
    const updatedEp = allEpisodes.find((e) => e.tvdb_id === 6001);
    expect(updatedEp?.name).toBe("Pilot (Updated)");
  });

  it("handles show with no seasons", async () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Announced Show" });

    const detail = makeShowDetail({
      name: "Announced Show",
      seasons: [],
      status: "Upcoming",
    });
    const client = createMockClient(detail);

    const result = await refreshTvShow(client, { id: showId });

    expect(result.show.status).toBe("Upcoming");
    expect(result.seasonsAdded).toBe(0);
    expect(result.episodesAdded).toBe(0);
    expect(result.seasons).toHaveLength(0);
  });

  it("handles specials (season 0)", async () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Breaking Bad" });

    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 5000,
          seasonNumber: 0,
          name: "Specials",
          overview: null,
          imageUrl: null,
          episodeCount: 1,
        },
        {
          tvdbId: 5001,
          seasonNumber: 1,
          name: "Season 1",
          overview: null,
          imageUrl: null,
          episodeCount: 1,
        },
      ],
    });
    const episodesBySeason: Record<number, TvdbEpisode[]> = {
      0: [
        makeEpisode({
          tvdbId: 7001,
          episodeNumber: 1,
          seasonNumber: 0,
          name: "Behind the Scenes",
        }),
      ],
      1: [
        makeEpisode({
          tvdbId: 6001,
          episodeNumber: 1,
          seasonNumber: 1,
          name: "Pilot",
        }),
      ],
    };
    const client = createMockClient(detail, episodesBySeason);

    const result = await refreshTvShow(client, { id: showId });

    expect(result.seasonsAdded).toBe(2);
    expect(result.episodesAdded).toBe(2);
    // Verify season 0 was included
    const specialsSeason = result.seasons.find((s) => s.seasonNumber === 0);
    expect(specialsSeason).toBeDefined();
    expect(specialsSeason?.name).toBe("Specials");
    // numberOfSeasons should exclude specials (season 0)
    expect(result.show.numberOfSeasons).toBe(1);
  });

  it("throws NotFoundError for invalid show id", async () => {
    const detail = makeShowDetail();
    const client = createMockClient(detail);

    await expect(refreshTvShow(client, { id: 99999 })).rejects.toThrow("TvShow");
  });

  it("skips episode refresh when refreshEpisodes is false", async () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Breaking Bad" });

    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 5001,
          seasonNumber: 1,
          name: "Season 1",
          overview: null,
          imageUrl: null,
          episodeCount: 7,
        },
      ],
    });
    const client = createMockClient(detail);

    const result = await refreshTvShow(client, {
      id: showId,
      refreshEpisodes: false,
    });

    // Seasons should still be upserted even when episodes are skipped
    expect(result.seasonsAdded).toBe(1);
    expect(result.episodesAdded).toBe(0);
    // getSeriesEpisodes should not have been called
    expect(client.getSeriesEpisodes).not.toHaveBeenCalled();
  });

  it("updates genres and networks from fresh data", async () => {
    const showId = seedTvShow(db, {
      tvdb_id: 81189,
      name: "Breaking Bad",
      genres: '["Crime"]',
      networks: '["NBC"]',
    });

    const detail = makeShowDetail({
      genres: [
        { id: 1, name: "Drama" },
        { id: 2, name: "Thriller" },
      ],
      networks: [{ id: 1, name: "AMC" }],
    });
    const client = createMockClient(detail);

    await refreshTvShow(client, {
      id: showId,
      refreshEpisodes: false,
    });

    // Check the raw DB row for genres/networks (stored as JSON strings)
    const row = db.prepare("SELECT genres, networks FROM tv_shows WHERE id = ?").get(showId) as {
      genres: string;
      networks: string;
    };
    expect(JSON.parse(row.genres)).toEqual(["Drama", "Thriller"]);
    expect(JSON.parse(row.networks)).toEqual(["AMC"]);
  });

  it("continues refreshing other seasons when one season's episode fetch fails", async () => {
    const showId = seedTvShow(db, { tvdb_id: 81189, name: "Breaking Bad" });

    const detail = makeShowDetail({
      seasons: [
        {
          tvdbId: 5001,
          seasonNumber: 1,
          name: "Season 1",
          overview: null,
          imageUrl: null,
          episodeCount: 1,
        },
        {
          tvdbId: 5002,
          seasonNumber: 2,
          name: "Season 2",
          overview: null,
          imageUrl: null,
          episodeCount: 1,
        },
      ],
    });

    const client = {
      getSeriesExtended: vi.fn().mockResolvedValue(detail),
      getSeriesEpisodes: vi.fn().mockImplementation((_tvdbId: number, seasonNumber: number) => {
        if (seasonNumber === 1) {
          return Promise.reject(new Error("Season not available"));
        }
        return Promise.resolve([
          makeEpisode({
            tvdbId: 6010,
            episodeNumber: 1,
            seasonNumber: 2,
            name: "S2 Ep1",
          }),
        ]);
      }),
      searchSeries: vi.fn(),
    } as unknown as TheTvdbClient;

    const result = await refreshTvShow(client, { id: showId });

    // Season 1 episodes failed, but season 2 should succeed
    expect(result.seasonsAdded).toBe(2);
    expect(result.episodesAdded).toBe(1);
  });

  it("re-downloads images when redownloadImages is true and imageCache provided", async () => {
    const showId = seedTvShow(db, { tvdb_id: 81189 });
    seedSeason(db, { tv_show_id: showId, tvdb_id: 30001, season_number: 1 });

    const detail = makeShowDetail({
      artworks: [
        {
          id: 1,
          type: 2,
          imageUrl: "https://artworks.thetvdb.com/poster.jpg",
          language: "eng",
          score: 100,
        },
        {
          id: 2,
          type: 3,
          imageUrl: "https://artworks.thetvdb.com/backdrop.jpg",
          language: "eng",
          score: 90,
        },
      ],
    });
    const client = createMockClient(detail, {});
    const mockImageCache = {
      deleteTvShowImages: vi.fn().mockResolvedValue(undefined),
      downloadTvShowImages: vi.fn().mockResolvedValue(undefined),
    };

    await refreshTvShow(client, {
      id: showId,
      redownloadImages: true,
      refreshEpisodes: false,
      imageCache: mockImageCache as unknown as ImageCacheService,
    });

    expect(mockImageCache.deleteTvShowImages).toHaveBeenCalledWith(81189);
    expect(mockImageCache.downloadTvShowImages).toHaveBeenCalledWith(
      81189,
      "https://artworks.thetvdb.com/poster.jpg",
      "https://artworks.thetvdb.com/backdrop.jpg"
    );
  });

  it("does not download images when redownloadImages is false", async () => {
    const showId = seedTvShow(db, { tvdb_id: 81189 });
    seedSeason(db, { tv_show_id: showId, tvdb_id: 30001, season_number: 1 });

    const detail = makeShowDetail();
    const client = createMockClient(detail, {});
    const mockImageCache = {
      deleteTvShowImages: vi.fn(),
      downloadTvShowImages: vi.fn(),
    };

    await refreshTvShow(client, {
      id: showId,
      redownloadImages: false,
      refreshEpisodes: false,
      imageCache: mockImageCache as unknown as ImageCacheService,
    });

    expect(mockImageCache.deleteTvShowImages).not.toHaveBeenCalled();
    expect(mockImageCache.downloadTvShowImages).not.toHaveBeenCalled();
  });
});
