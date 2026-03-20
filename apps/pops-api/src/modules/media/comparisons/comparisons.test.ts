import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
  seedDimension,
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
    expect(result.data[0].name).toBe("Visuals");
    expect(result.data[1].name).toBe("Story");
    expect(result.data[2].name).toBe("Acting");
  });

  it("returns correct shape with boolean active", async () => {
    seedDimension(db, { name: "Overall", active: 1 });
    const result = await caller.media.comparisons.listDimensions();
    expect(result.data[0].active).toBe(true);
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

    await expect(
      caller.media.comparisons.createDimension({ name: "Overall" }),
    ).rejects.toThrow(TRPCError);
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
      }),
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
    expect(scores.data[0].score).toBeGreaterThan(1500);
    expect(scores.data[0].comparisonCount).toBe(1);

    const loserScores = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 2,
    });
    expect(loserScores.data[0].score).toBeLessThan(1500);
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
      }),
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
      }),
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
    expect(storyScores.data[0].score).toBeGreaterThan(1500);

    const visualScores = await caller.media.comparisons.scores({
      mediaType: "movie",
      mediaId: 1,
      dimensionId: dim2,
    });
    expect(visualScores.data).toHaveLength(1);
    expect(visualScores.data[0].score).toBeLessThan(1500);
  });
});

describe("comparisons auth", () => {
  it("rejects unauthenticated calls", async () => {
    const anonCaller = createCaller(false);
    await expect(
      anonCaller.media.comparisons.listDimensions(),
    ).rejects.toThrow(TRPCError);
  });
});
