import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
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

describe("comparisons.listDimensions", () => {
  it("returns empty list when no dimensions exist", async () => {
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data).toEqual([]);
  });

  it("returns dimensions sorted by sortOrder", async () => {
    seedDimension(db, { name: "Acting", sort_order: 2 });
    seedDimension(db, { name: "Story", sort_order: 1 });
    seedDimension(db, { name: "Visuals", sort_order: 0 });

    const result = await caller.media.comparisons.listDimensions();
    expect(result.data).toHaveLength(3);
    expect(result.data[0]!.name).toBe("Visuals");
    expect(result.data[1]!.name).toBe("Story");
    expect(result.data[2]!.name).toBe("Acting");
  });

  it("returns correct shape with boolean active", async () => {
    seedDimension(db, { name: "Overall", active: 1 });
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data[0]!.active).toBe(true);
    expect(result.data[0]).toHaveProperty("id");
    expect(result.data[0]).toHaveProperty("name", "Overall");
    expect(result.data[0]).toHaveProperty("createdAt");
  });
});

describe("comparisons.createDimension", () => {
  it("creates a new dimension", async () => {
    const result = await caller.media.comparisons.createDimension({
      name: "Overall",
    });
    expect(result.data.name).toBe("Overall");
    expect(result.data.active).toBe(true);
    expect(result.data.sortOrder).toBe(0);
  });

  it("throws CONFLICT on duplicate name", async () => {
    seedDimension(db, { name: "Overall" });

    await expect(caller.media.comparisons.createDimension({ name: "Overall" })).rejects.toThrow(
      TRPCError
    );
  });
});

describe("comparisons.updateDimension", () => {
  it("updates dimension fields", async () => {
    const dimId = seedDimension(db, { name: "Old Name" });

    const result = await caller.media.comparisons.updateDimension({
      id: dimId,
      data: { name: "New Name", active: false },
    });
    expect(result.data.name).toBe("New Name");
    expect(result.data.active).toBe(false);
  });

  it("throws NOT_FOUND for missing dimension", async () => {
    await expect(
      caller.media.comparisons.updateDimension({
        id: 999,
        data: { name: "X" },
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("comparisons.record", () => {
  it("records a comparison and returns it", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    const result = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });

    expect(result.data.dimensionId).toBe(dimId);
    expect(result.data.winnerId).toBe(1);
  });

  it("updates Elo scores after comparison", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });

    const scores = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
    });
    expect(scores.data).toHaveLength(1);
    expect(scores.data[0]!.score).toBeGreaterThan(1500);
    expect(scores.data[0]!.comparisonCount).toBe(1);

    const loserScores = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
    });
    expect(loserScores.data[0]!.score).toBeLessThan(1500);
  });

  it("throws NOT_FOUND for missing dimension", async () => {
    await expect(
      caller.media.comparisons.record({
        dimensionId: 999,
        mediaAType: "movie",
        mediaAId: 1,
        mediaBType: "movie",
        mediaBId: 2,
        winnerType: "movie",
        winnerId: 1,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws BAD_REQUEST when winner does not match either media", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    await expect(
      caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: "movie",
        mediaAId: 1,
        mediaBType: "movie",
        mediaBId: 2,
        winnerType: "movie",
        winnerId: 999,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws when dimension is inactive", async () => {
    const dimId = seedDimension(db, { name: "Retired", active: 0 });

    await expect(
      caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: "movie",
        mediaAId: 1,
        mediaBType: "movie",
        mediaBId: 2,
        winnerType: "movie",
        winnerId: 1,
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("comparisons.listForMedia", () => {
  it("returns comparisons involving a media item", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 3,
      mediaBType: "movie",
      mediaBId: 1,
      winnerType: "movie",
      winnerId: 1,
    });

    const result = await caller.media.comparisons.listForMedia({
      mediaType: "movie",
      mediaId: 1,
    });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it("supports pagination", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    for (let i = 2; i <= 4; i++) {
      await caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: "movie",
        mediaAId: 1,
        mediaBType: "movie",
        mediaBId: i,
        winnerType: "movie",
        winnerId: 1,
      });
    }

    const result = await caller.media.comparisons.listForMedia({
      mediaType: "movie",
      mediaId: 1,
      limit: 2,
      offset: 0,
    });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.hasMore).toBe(true);
  });
});

describe("comparisons.scores", () => {
  it("returns empty when no scores exist", async () => {
    const result = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 999,
    });
    expect(result.data).toEqual([]);
  });

  it("filters by dimension", async () => {
    const dim1 = seedDimension(db, { name: "Story" });
    const dim2 = seedDimension(db, { name: "Visuals" });

    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 2,
    });

    const storyScores = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dim1,
    });
    expect(storyScores.data).toHaveLength(1);
    expect(storyScores.data[0]!.score).toBeGreaterThan(1500);

    const visualScores = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dim2,
    });
    expect(visualScores.data).toHaveLength(1);
    expect(visualScores.data[0]!.score).toBeLessThan(1500);
  });
});

describe("comparisons.getRandomPair", () => {
  it("returns a pair of watched movies", async () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedMovie(db, { tmdb_id: 550, title: "Fight Club", poster_path: "/fc.jpg" });
    const m2 = seedMovie(db, { tmdb_id: 551, title: "The Matrix", poster_path: "/mx.jpg" });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: m2 });

    const result = await caller.media.comparisons.getRandomPair({ dimensionId: dimId });
    expect(result.data).not.toBeNull();
    expect(result.data!.movieA).toHaveProperty("id");
    expect(result.data!.movieA).toHaveProperty("title");
    expect(result.data!.movieA).toHaveProperty("posterPath");
    expect(result.data!.movieB).toHaveProperty("id");
    expect(result.data!.movieB).toHaveProperty("title");
    expect(result.data!.movieA.id).not.toBe(result.data!.movieB.id);
  });

  it("returns null data when fewer than 2 watched movies", async () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedMovie(db, { tmdb_id: 550, title: "Fight Club" });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: m1 });

    const result = await caller.media.comparisons.getRandomPair({ dimensionId: dimId });
    expect(result.data).toBeNull();
    expect(result.reason).toBe("insufficient_watched_movies");
  });

  it("returns null data when no watched movies exist", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    const result = await caller.media.comparisons.getRandomPair({ dimensionId: dimId });
    expect(result.data).toBeNull();
    expect(result.reason).toBe("insufficient_watched_movies");
  });

  it("throws NOT_FOUND for missing dimension", async () => {
    await expect(caller.media.comparisons.getRandomPair({ dimensionId: 999 })).rejects.toThrow(
      TRPCError
    );
  });

  it("avoids recently compared pairs", async () => {
    const dimId = seedDimension(db, { name: "Overall" });
    // Create 3 movies so there are multiple possible pairs
    const m1 = seedMovie(db, { tmdb_id: 550, title: "Fight Club" });
    const m2 = seedMovie(db, { tmdb_id: 551, title: "The Matrix" });
    const m3 = seedMovie(db, { tmdb_id: 552, title: "Inception" });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: m1 });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: m2 });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: m3 });

    // Record comparison between m1 and m2
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: m1,
      mediaBType: "movie",
      mediaBId: m2,
      winnerType: "movie",
      winnerId: m1,
    });

    // With avoidRecent=1, the pair (m1, m2) should be avoided
    // Run several times — the pair should involve m3
    let sawM3 = false;
    for (let i = 0; i < 20; i++) {
      const result = await caller.media.comparisons.getRandomPair({
        dimensionId: dimId,
        avoidRecent: 1,
      });
      const ids = [result.data!.movieA.id, result.data!.movieB.id].sort();
      if (ids.includes(m3)) sawM3 = true;
      // The recently compared pair (m1, m2) should not appear
      expect(ids).not.toEqual([m1, m2].sort());
    }
    expect(sawM3).toBe(true);
  });

  it("only considers completed watches", async () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedMovie(db, { tmdb_id: 550, title: "Fight Club" });
    const m2 = seedMovie(db, { tmdb_id: 551, title: "The Matrix" });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: m1, completed: 1 });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: m2, completed: 0 }); // incomplete

    // Only 1 completed watch → not enough
    const result = await caller.media.comparisons.getRandomPair({ dimensionId: dimId });
    expect(result.data).toBeNull();
    expect(result.reason).toBe("insufficient_watched_movies");
  });
});

describe("comparisons.rankings", () => {
  it("returns empty when no scores exist", async () => {
    const result = await caller.media.comparisons.rankings({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("returns per-dimension rankings ordered by score", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    // Movie 1 beats movie 2, movie 1 beats movie 3
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 3,
      winnerType: "movie",
      winnerId: 1,
    });

    const result = await caller.media.comparisons.rankings({ dimensionId: dimId });
    expect(result.data.length).toBe(3);
    expect(result.data[0]!.rank).toBe(1);
    expect(result.data[0]!.mediaId).toBe(1); // winner should be #1
    expect(result.data[0]!.score).toBeGreaterThan(1500);
    expect(result.data[1]!.rank).toBe(2);
    expect(result.data[2]!.rank).toBe(3);
  });

  it("returns overall rankings averaging across active dimensions", async () => {
    const dim1 = seedDimension(db, { name: "Story", active: 1 });
    const dim2 = seedDimension(db, { name: "Visuals", active: 1 });

    // Movie 1 wins in Story, Movie 2 wins in Visuals
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 2,
    });

    const result = await caller.media.comparisons.rankings({});
    expect(result.data.length).toBe(2);
    // Both should have avg score ~1500 since each won one dimension
    expect(result.data[0]!.rank).toBe(1);
    expect(result.data[1]!.rank).toBe(2);
  });

  it("filters by mediaType", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    // Movie comparison
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });
    // TV show comparison
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "tv_show",
      mediaAId: 10,
      mediaBType: "tv_show",
      mediaBId: 20,
      winnerType: "tv_show",
      winnerId: 10,
    });

    const movieRankings = await caller.media.comparisons.rankings({
      dimensionId: dimId,
      mediaType: "movie",
    });
    expect(movieRankings.data.length).toBe(2);
    expect(movieRankings.data.every((r) => r.mediaType === "movie")).toBe(true);

    const tvRankings = await caller.media.comparisons.rankings({
      dimensionId: dimId,
      mediaType: "tv_show",
    });
    expect(tvRankings.data.length).toBe(2);
    expect(tvRankings.data.every((r) => r.mediaType === "tv_show")).toBe(true);
  });

  it("supports pagination", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    // Create 4 movies with comparisons
    for (let i = 2; i <= 4; i++) {
      await caller.media.comparisons.record({
        dimensionId: dimId,
        mediaAType: "movie",
        mediaAId: 1,
        mediaBType: "movie",
        mediaBId: i,
        winnerType: "movie",
        winnerId: 1,
      });
    }

    const page1 = await caller.media.comparisons.rankings({
      dimensionId: dimId,
      limit: 2,
      offset: 0,
    });
    expect(page1.data.length).toBe(2);
    expect(page1.pagination.total).toBe(4);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.data[0]!.rank).toBe(1);
    expect(page1.data[1]!.rank).toBe(2);

    const page2 = await caller.media.comparisons.rankings({
      dimensionId: dimId,
      limit: 2,
      offset: 2,
    });
    expect(page2.data.length).toBe(2);
    expect(page2.data[0]!.rank).toBe(3);
    expect(page2.data[1]!.rank).toBe(4);
  });

  it("excludes inactive dimensions from overall rankings", async () => {
    const activeDim = seedDimension(db, { name: "Story", active: 1 });
    // Create as active so we can record comparisons, then deactivate
    const inactiveDim = seedDimension(db, { name: "Inactive", active: 1 });

    await caller.media.comparisons.record({
      dimensionId: activeDim,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: inactiveDim,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 2,
    });

    // Now deactivate the dimension
    await caller.media.comparisons.updateDimension({
      id: inactiveDim,
      data: { active: false },
    });

    // Overall should only use active dimension
    const result = await caller.media.comparisons.rankings({});
    expect(result.data.length).toBe(2);
    // Movie 1 won in active dim, so should rank higher
    expect(result.data[0]!.mediaId).toBe(1);
    expect(result.data[0]!.score).toBeGreaterThan(1500);
  });
});

describe("comparisons auth", () => {
  it("rejects unauthenticated calls", async () => {
    const anonCaller = createCaller(false);
    await expect(anonCaller.media.comparisons.listDimensions()).rejects.toThrow(TRPCError);
  });
});
