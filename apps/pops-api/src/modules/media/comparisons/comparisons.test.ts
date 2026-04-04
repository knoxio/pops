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
import { blacklistMovie } from "./service.js";

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
  it("seeds 5 default dimensions when none exist", async () => {
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data).toHaveLength(5);
    expect(result.data.map((d) => d.name)).toEqual([
      "Cinematography",
      "Entertainment",
      "Emotional Impact",
      "Rewatchability",
      "Soundtrack",
    ]);
  });

  it("returns defaults sorted by sortOrder", async () => {
    const result = await caller.media.comparisons.listDimensions();
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]!.sortOrder).toBe(i);
    }
  });

  it("does not re-seed when dimensions already exist", async () => {
    seedDimension(db, { name: "Custom Only" });
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe("Custom Only");
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

  it("toggles active off and back on", async () => {
    const dimId = seedDimension(db, { name: "Toggle Me", active: 1 });

    const off = await caller.media.comparisons.updateDimension({
      id: dimId,
      data: { active: false },
    });
    expect(off.data.active).toBe(false);

    const on = await caller.media.comparisons.updateDimension({
      id: dimId,
      data: { active: true },
    });
    expect(on.data.active).toBe(true);
  });

  it("swaps sort order between dimensions", async () => {
    const dimA = seedDimension(db, { name: "First", sort_order: 0 });
    const dimB = seedDimension(db, { name: "Second", sort_order: 1 });

    // Swap sort orders
    await caller.media.comparisons.updateDimension({ id: dimA, data: { sortOrder: 1 } });
    await caller.media.comparisons.updateDimension({ id: dimB, data: { sortOrder: 0 } });

    const result = await caller.media.comparisons.listDimensions();
    expect(result.data[0]!.name).toBe("Second");
    expect(result.data[1]!.name).toBe("First");
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

  it("breaks ties by title alphabetically (per-dimension)", async () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const mZebra = seedMovie(db, { tmdb_id: 601, title: "Zebra Movie" });
    const mAlpha = seedMovie(db, { tmdb_id: 602, title: "Alpha Movie" });

    // Each movie wins once -> scores return to ~1500
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: mZebra,
      mediaBType: "movie",
      mediaBId: mAlpha,
      winnerType: "movie",
      winnerId: mZebra,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: mZebra,
      mediaBType: "movie",
      mediaBId: mAlpha,
      winnerType: "movie",
      winnerId: mAlpha,
    });

    const result = await caller.media.comparisons.rankings({ dimensionId: dimId });
    expect(result.data.length).toBe(2);
    // Equal scores -> alphabetical: Alpha before Zebra
    expect(result.data[0]!.mediaId).toBe(mAlpha);
    expect(result.data[1]!.mediaId).toBe(mZebra);
  });

  it("sorts zero-comparison items after scored items (per-dimension)", async () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const mScored1 = seedMovie(db, { tmdb_id: 701, title: "Scored Movie" });
    const mScored2 = seedMovie(db, { tmdb_id: 702, title: "Another Scored" });
    const mUnscored = seedMovie(db, { tmdb_id: 703, title: "Aardvark Unscored" });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: mScored1,
      mediaBType: "movie",
      mediaBId: mScored2,
      winnerType: "movie",
      winnerId: mScored1,
    });

    // Insert an unscored entry (comparison_count = 0, score = 1500)
    db.prepare(
      `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count)
       VALUES ('movie', ?, ?, 1500.0, 0)`
    ).run(mUnscored, dimId);

    const result = await caller.media.comparisons.rankings({ dimensionId: dimId });
    expect(result.data.length).toBe(3);
    // Unscored item should be last despite alphabetically first title
    expect(result.data[2]!.mediaId).toBe(mUnscored);
    expect(result.data[2]!.comparisonCount).toBe(0);
  });

  it("breaks ties by title in overall rankings", async () => {
    const dim1 = seedDimension(db, { name: "Story", active: 1 });
    const dim2 = seedDimension(db, { name: "Visuals", active: 1 });
    const mZebra = seedMovie(db, { tmdb_id: 801, title: "Zebra Film" });
    const mAlpha = seedMovie(db, { tmdb_id: 802, title: "Alpha Film" });

    // Each movie wins one dimension -> average scores should be equal
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: "movie",
      mediaAId: mZebra,
      mediaBType: "movie",
      mediaBId: mAlpha,
      winnerType: "movie",
      winnerId: mZebra,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: "movie",
      mediaAId: mZebra,
      mediaBType: "movie",
      mediaBId: mAlpha,
      winnerType: "movie",
      winnerId: mAlpha,
    });

    const result = await caller.media.comparisons.rankings({});
    expect(result.data.length).toBe(2);
    // Equal average scores -> alphabetical: Alpha before Zebra
    expect(result.data[0]!.mediaId).toBe(mAlpha);
    expect(result.data[1]!.mediaId).toBe(mZebra);
  });
});

describe("comparisons.delete", () => {
  it("deletes a comparison and removes it from listAll", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    const recorded = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });

    const before = await caller.media.comparisons.listAll({});
    expect(before.pagination.total).toBe(1);

    const result = await caller.media.comparisons.delete({
      id: recorded.data.id,
    });
    expect(result.message).toBe("Comparison deleted and scores recalculated");

    const after = await caller.media.comparisons.listAll({});
    expect(after.pagination.total).toBe(0);
  });

  it("throws NOT_FOUND for non-existent comparison", async () => {
    await expect(caller.media.comparisons.delete({ id: 999 })).rejects.toThrow(TRPCError);

    try {
      await caller.media.comparisons.delete({ id: 999 });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("rejects unauthenticated calls", async () => {
    const anonCaller = createCaller(false);
    await expect(anonCaller.media.comparisons.delete({ id: 1 })).rejects.toThrow(TRPCError);
  });
});

describe("comparisons.delete (Elo recalculation)", () => {
  it("resets scores to 1500 when deleting the only comparison", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    const recorded = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });

    // Verify scores changed from default
    const beforeWinner = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
    });
    expect(beforeWinner.data[0]!.score).toBeGreaterThan(1500);

    await caller.media.comparisons.delete({ id: recorded.data.id });

    // Both scores should be reset to 1500 with comparisonCount=0
    const winnerScores = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
    });
    expect(winnerScores.data[0]!.score).toBe(1500);
    expect(winnerScores.data[0]!.comparisonCount).toBe(0);

    const loserScores = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
    });
    expect(loserScores.data[0]!.score).toBe(1500);
    expect(loserScores.data[0]!.comparisonCount).toBe(0);
  });

  it("recalculates scores correctly when deleting one of multiple comparisons", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    // Record two comparisons: movie 1 beats 2, movie 1 beats 3
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });
    const second = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 3,
      winnerType: "movie",
      winnerId: 1,
    });

    // Delete second comparison (1 vs 3)
    await caller.media.comparisons.delete({ id: second.data.id });

    // Movie 1 should still be above 1500 (won vs movie 2)
    const scores1 = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
    });
    expect(scores1.data[0]!.score).toBeGreaterThan(1500);
    expect(scores1.data[0]!.comparisonCount).toBe(1);

    // Movie 2 should be below 1500 (lost to movie 1)
    const scores2 = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
    });
    expect(scores2.data[0]!.score).toBeLessThan(1500);
    expect(scores2.data[0]!.comparisonCount).toBe(1);

    // Movie 3 should be back to 1500 (no remaining comparisons)
    const scores3 = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 3,
    });
    expect(scores3.data[0]!.score).toBe(1500);
    expect(scores3.data[0]!.comparisonCount).toBe(0);
  });

  it("does not affect scores in other dimensions", async () => {
    const dim1 = seedDimension(db, { name: "Story" });
    const dim2 = seedDimension(db, { name: "Visuals" });

    // Record in both dimensions
    const comp1 = await caller.media.comparisons.record({
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

    // Capture dim2 scores before delete
    const dim2Before = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dim2,
    });

    // Delete the dim1 comparison
    await caller.media.comparisons.delete({ id: comp1.data.id });

    // dim2 scores should be unchanged
    const dim2After = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dim2,
    });
    expect(dim2After.data[0]!.score).toBe(dim2Before.data[0]!.score);
    expect(dim2After.data[0]!.comparisonCount).toBe(dim2Before.data[0]!.comparisonCount);
  });

  it("replays correctly when deleting middle comparison from a chain", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    // Record a fresh single comparison to get the expected scores
    // First, build the chain: A beats B, B beats C, A beats C
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });
    const comp2 = await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 2,
      mediaBType: "movie",
      mediaBId: 3,
      winnerType: "movie",
      winnerId: 2,
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

    // Delete middle comparison (B beats C)
    await caller.media.comparisons.delete({ id: comp2.data.id });

    // Should have 2 remaining comparisons
    const remaining = await caller.media.comparisons.listAll({ dimensionId: dimId });
    expect(remaining.pagination.total).toBe(2);

    // Movie 1 should be top ranked (won both remaining comparisons)
    const scores1 = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
    });
    expect(scores1.data[0]!.score).toBeGreaterThan(1500);
    expect(scores1.data[0]!.comparisonCount).toBe(2);

    // Movie 2 should have 1 comparison (lost to movie 1)
    const scores2 = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
    });
    expect(scores2.data[0]!.comparisonCount).toBe(1);
    expect(scores2.data[0]!.score).toBeLessThan(1500);

    // Movie 3 should have 1 comparison (lost to movie 1)
    const scores3 = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 3,
    });
    expect(scores3.data[0]!.comparisonCount).toBe(1);
    expect(scores3.data[0]!.score).toBeLessThan(1500);
  });

  it("produces same scores as fresh recording after delete and replay", async () => {
    const dimId = seedDimension(db, { name: "Overall" });

    // Record two comparisons, then delete the first
    const comp1 = await caller.media.comparisons.record({
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
      mediaAId: 2,
      mediaBType: "movie",
      mediaBId: 3,
      winnerType: "movie",
      winnerId: 2,
    });

    // Delete first comparison — only comp2 (movie 2 beats 3) remains
    await caller.media.comparisons.delete({ id: comp1.data.id });

    const afterDelete2 = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
    });
    const afterDelete3 = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 3,
    });

    // The replayed scores for a single "2 beats 3" comparison should match
    // what you'd get from a fresh comparison at default 1500 ratings.
    // K=32, expected=0.5 for equal ratings → winner gets 1500+16=1516, loser gets 1500-16=1484
    expect(afterDelete2.data[0]!.score).toBe(1516);
    expect(afterDelete3.data[0]!.score).toBe(1484);
    expect(afterDelete2.data[0]!.comparisonCount).toBe(1);
    expect(afterDelete3.data[0]!.comparisonCount).toBe(1);
  });
});

describe("comparisons.listAll", () => {
  it("returns all comparisons across dimensions", async () => {
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

    const result = await caller.media.comparisons.listAll({});
    expect(result.pagination.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it("filters by dimensionId", async () => {
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

    const result = await caller.media.comparisons.listAll({ dimensionId: dim1 });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0]!.dimensionId).toBe(dim1);
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

    const page1 = await caller.media.comparisons.listAll({ limit: 2, offset: 0 });
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await caller.media.comparisons.listAll({ limit: 2, offset: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

describe("dimension weights", () => {
  it("listDimensions returns weight field defaulting to 1.0", async () => {
    seedDimension(db, { name: "Story" });
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data[0]!.weight).toBe(1.0);
  });

  it("createDimension with custom weight", async () => {
    const result = await caller.media.comparisons.createDimension({
      name: "Cinematography",
      weight: 2.5,
    });
    expect(result.data.weight).toBe(2.5);
  });

  it("updateDimension updates weight", async () => {
    const dimId = seedDimension(db, { name: "Story" });
    const result = await caller.media.comparisons.updateDimension({
      id: dimId,
      data: { weight: 3.0 },
    });
    expect(result.data.weight).toBe(3.0);
  });

  it("weighted overall ranking uses weighted average", async () => {
    // dim1 has weight 3.0, dim2 has weight 1.0
    const dim1 = seedDimension(db, { name: "Story", active: 1, weight: 3.0 });
    const dim2 = seedDimension(db, { name: "Visuals", active: 1, weight: 1.0 });

    // Movie 1 wins on Story (weight=3), Movie 2 wins on Visuals (weight=1)
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

    // Overall: Movie 1 should rank higher because Story (weight=3) outweighs Visuals (weight=1)
    const result = await caller.media.comparisons.rankings({});
    expect(result.data).toHaveLength(2);
    expect(result.data[0]!.mediaId).toBe(1);
    expect(result.data[0]!.score).toBeGreaterThan(1500);
    expect(result.data[1]!.mediaId).toBe(2);
    expect(result.data[1]!.score).toBeLessThan(1500);
  });

  it("equal weights produce same result as simple average", async () => {
    const dim1 = seedDimension(db, { name: "Story", active: 1, weight: 1.0 });
    const dim2 = seedDimension(db, { name: "Visuals", active: 1, weight: 1.0 });

    // Movie 1 wins both dimensions
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
      winnerId: 1,
    });

    // Get per-dimension scores
    const dim1Rankings = await caller.media.comparisons.rankings({ dimensionId: dim1 });
    const dim2Rankings = await caller.media.comparisons.rankings({ dimensionId: dim2 });

    const movie1Dim1Score = dim1Rankings.data.find((r) => r.mediaId === 1)!.score;
    const movie1Dim2Score = dim2Rankings.data.find((r) => r.mediaId === 1)!.score;
    const expectedAvg = Math.round(((movie1Dim1Score + movie1Dim2Score) / 2) * 10) / 10;

    // Overall should equal simple average when weights are equal
    const overall = await caller.media.comparisons.rankings({});
    const movie1Overall = overall.data.find((r) => r.mediaId === 1)!.score;
    expect(movie1Overall).toBe(expectedAvg);
  });
});

describe("tiered draws", () => {
  it("high draw: both movies gain score", async () => {
    const dimId = seedDimension(db, { name: "Story" });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 0,
      drawTier: "high",
    });

    const scoresA = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dimId,
    });
    const scoresB = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
      dimensionId: dimId,
    });
    // Both should be above 1500 (outcome 0.7 > expected 0.5)
    expect(scoresA.data[0]!.score).toBeGreaterThan(1500);
    expect(scoresB.data[0]!.score).toBeGreaterThan(1500);
  });

  it("mid draw: both movies stay at 1500", async () => {
    const dimId = seedDimension(db, { name: "Visuals" });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 0,
      drawTier: "mid",
    });

    const scoresA = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dimId,
    });
    const scoresB = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
      dimensionId: dimId,
    });
    expect(scoresA.data[0]!.score).toBe(1500);
    expect(scoresB.data[0]!.score).toBe(1500);
  });

  it("low draw: both movies lose score", async () => {
    const dimId = seedDimension(db, { name: "Sound" });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 0,
      drawTier: "low",
    });

    const scoresA = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dimId,
    });
    const scoresB = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
      dimensionId: dimId,
    });
    expect(scoresA.data[0]!.score).toBeLessThan(1500);
    expect(scoresB.data[0]!.score).toBeLessThan(1500);
  });

  it("legacy draw without tier uses 0.5 (neutral)", async () => {
    const dimId = seedDimension(db, { name: "Entertainment" });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 0,
    });

    const scoresA = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dimId,
    });
    expect(scoresA.data[0]!.score).toBe(1500);
  });
});

describe("calculateConfidence", () => {
  // Import the pure function directly for unit tests
  it("returns 0 at count=0", async () => {
    const { calculateConfidence } = await import("./types.js");
    expect(calculateConfidence(0)).toBe(0);
  });

  it("returns ~0.29 at count=1", async () => {
    const { calculateConfidence } = await import("./types.js");
    expect(calculateConfidence(1)).toBeCloseTo(0.2929, 3);
  });

  it("returns ~0.5 at count=3", async () => {
    const { calculateConfidence } = await import("./types.js");
    expect(calculateConfidence(3)).toBeCloseTo(0.5, 1);
  });

  it("returns ~0.82 at count=30", async () => {
    const { calculateConfidence } = await import("./types.js");
    expect(calculateConfidence(30)).toBeCloseTo(0.8204, 2);
  });
});

describe("confidence in API responses", () => {
  it("scores endpoint includes confidence per entry", async () => {
    const dimId = seedDimension(db, { name: "Story" });

    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 2,
      winnerType: "movie",
      winnerId: 1,
    });

    const result = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.confidence).toBeCloseTo(0.2929, 3);
    expect(result.data[0]!.comparisonCount).toBe(1);
  });

  it("per-dimension rankings include confidence", async () => {
    const dimId = seedDimension(db, { name: "Visuals" });

    // Do 2 comparisons so movie 1 has comparisonCount=2
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
    // Movie 1 has 2 comparisons
    const movie1 = result.data.find((r) => r.mediaId === 1);
    expect(movie1).toBeDefined();
    expect(movie1!.confidence).toBeCloseTo(1 - 1 / Math.sqrt(3), 3); // count=2 → sqrt(3)
  });

  it("overall rankings confidence = min confidence across dimensions", async () => {
    const dim1 = seedDimension(db, { name: "Story", active: 1 });
    const dim2 = seedDimension(db, { name: "Visuals", active: 1 });

    // Movie 1: 3 comparisons in dim1, 1 comparison in dim2
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
      dimensionId: dim1,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 3,
      winnerType: "movie",
      winnerId: 1,
    });
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: "movie",
      mediaAId: 1,
      mediaBType: "movie",
      mediaBId: 4,
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
      winnerId: 1,
    });

    const result = await caller.media.comparisons.rankings({});
    const movie1 = result.data.find((r) => r.mediaId === 1);
    expect(movie1).toBeDefined();
    // dim1: 3 comparisons → confidence ~0.5, dim2: 1 comparison → confidence ~0.29
    // overall = min = ~0.29
    expect(movie1!.confidence).toBeCloseTo(1 - 1 / Math.sqrt(2), 3); // count=1 → sqrt(2)
  });
});

describe("comparisons auth", () => {
  it("rejects unauthenticated calls", async () => {
    const anonCaller = createCaller(false);
    await expect(anonCaller.media.comparisons.listDimensions()).rejects.toThrow(TRPCError);
  });
});

describe("blacklistMovie", () => {
  it("sets blacklisted=1 on matching watch_history rows", () => {
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 10 });
    seedWatchHistoryEntry(db, {
      media_type: "movie",
      media_id: 10,
      watched_at: "2026-01-02T00:00:00Z",
    });

    const result = blacklistMovie("movie", 10);
    expect(result.blacklistedCount).toBe(2);

    const rows = db.prepare("SELECT blacklisted FROM watch_history WHERE media_id = 10").all() as {
      blacklisted: number;
    }[];
    expect(rows.every((r) => r.blacklisted === 1)).toBe(true);
  });

  it("does not blacklist unrelated movies", () => {
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 10 });
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 20 });

    blacklistMovie("movie", 10);

    const unrelated = db
      .prepare("SELECT blacklisted FROM watch_history WHERE media_id = 20")
      .get() as { blacklisted: number };
    expect(unrelated.blacklisted).toBe(0);
  });

  it("deletes all comparisons involving the blacklisted movie", async () => {
    const dimId = seedDimension(db, { name: "Story" });

    // movie 10 vs 20, movie 10 vs 30, movie 20 vs 30
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 10,
      mediaBType: "movie",
      mediaBId: 20,
      winnerType: "movie",
      winnerId: 10,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 10,
      mediaBType: "movie",
      mediaBId: 30,
      winnerType: "movie",
      winnerId: 30,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 20,
      mediaBType: "movie",
      mediaBId: 30,
      winnerType: "movie",
      winnerId: 20,
    });

    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 10 });

    const result = blacklistMovie("movie", 10);
    expect(result.comparisonsDeleted).toBe(2); // 10v20 and 10v30

    // Only the 20v30 comparison remains
    const remaining = await caller.media.comparisons.listAll({});
    expect(remaining.pagination.total).toBe(1);
    expect(remaining.data[0]!.mediaAId).toBe(20);
    expect(remaining.data[0]!.mediaBId).toBe(30);
  });

  it("recalculates ELO for affected dimensions", async () => {
    const dimId = seedDimension(db, { name: "Story" });

    // movie 10 beats 20, movie 20 beats 30
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 10,
      mediaBType: "movie",
      mediaBId: 20,
      winnerType: "movie",
      winnerId: 10,
    });
    await caller.media.comparisons.record({
      dimensionId: dimId,
      mediaAType: "movie",
      mediaAId: 20,
      mediaBType: "movie",
      mediaBId: 30,
      winnerType: "movie",
      winnerId: 20,
    });

    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 10 });

    const result = blacklistMovie("movie", 10);
    expect(result.dimensionsRecalculated).toBe(1);

    // After blacklisting movie 10, only "20 beats 30" remains
    // Both should be recalculated from 1500: winner gets 1516, loser gets 1484
    const scores20 = await caller.media.comparisons.scores({ mediaType: "movie", mediaId: 20 });
    const scores30 = await caller.media.comparisons.scores({ mediaType: "movie", mediaId: 30 });
    expect(scores20.data[0]!.score).toBe(1516);
    expect(scores30.data[0]!.score).toBe(1484);
    expect(scores20.data[0]!.comparisonCount).toBe(1);

    // Movie 10 scores should be reset to 1500 with 0 comparisons
    const scores10 = await caller.media.comparisons.scores({ mediaType: "movie", mediaId: 10 });
    expect(scores10.data[0]!.score).toBe(1500);
    expect(scores10.data[0]!.comparisonCount).toBe(0);
  });

  it("handles multiple dimensions", async () => {
    const dim1 = seedDimension(db, { name: "Story" });
    const dim2 = seedDimension(db, { name: "Visuals" });

    // Movie 10 vs 20 in both dimensions
    await caller.media.comparisons.record({
      dimensionId: dim1,
      mediaAType: "movie",
      mediaAId: 10,
      mediaBType: "movie",
      mediaBId: 20,
      winnerType: "movie",
      winnerId: 10,
    });
    await caller.media.comparisons.record({
      dimensionId: dim2,
      mediaAType: "movie",
      mediaAId: 10,
      mediaBType: "movie",
      mediaBId: 20,
      winnerType: "movie",
      winnerId: 20,
    });

    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 10 });

    const result = blacklistMovie("movie", 10);
    expect(result.comparisonsDeleted).toBe(2);
    expect(result.dimensionsRecalculated).toBe(2);

    // All comparisons gone
    const remaining = await caller.media.comparisons.listAll({});
    expect(remaining.pagination.total).toBe(0);
  });

  it("returns zero counts when movie has no watch history or comparisons", () => {
    const result = blacklistMovie("movie", 999);
    expect(result.blacklistedCount).toBe(0);
    expect(result.comparisonsDeleted).toBe(0);
    expect(result.dimensionsRecalculated).toBe(0);
  });

  it("is idempotent — re-blacklisting does not double-count", () => {
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: 10 });

    const first = blacklistMovie("movie", 10);
    expect(first.blacklistedCount).toBe(1);

    const second = blacklistMovie("movie", 10);
    expect(second.blacklistedCount).toBe(0); // already blacklisted
  });
});
