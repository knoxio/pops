import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
} from "../../../shared/test-utils.js";
import { submitTierList } from "./service.js";
import { getTierOverrideForMedia } from "./tier-overrides.js";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

/** Seed a movie and mark it as watched so it's eligible for comparisons. */
function seedWatchedMovie(tmdbId: number, title: string): number {
  const movieId = seedMovie(db, {
    tmdb_id: tmdbId,
    title,
    poster_path: `/${title.toLowerCase()}.jpg`,
  });
  seedWatchHistoryEntry(db, { media_type: "movie", media_id: movieId });
  return movieId;
}

describe("submitTierList", () => {
  it("records correct number of pairwise comparisons", () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedWatchedMovie(100, "Movie A");
    const m2 = seedWatchedMovie(101, "Movie B");
    const m3 = seedWatchedMovie(102, "Movie C");

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: "S" },
        { movieId: m2, tier: "A" },
        { movieId: m3, tier: "B" },
      ],
    });

    // 3 movies → 3*(3-1)/2 = 3 pairwise comparisons
    expect(result.comparisonsRecorded).toBe(3);
    expect(result.scoreChanges).toHaveLength(3);
  });

  it("records n*(n-1)/2 comparisons for 4 movies", () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedWatchedMovie(100, "Movie A");
    const m2 = seedWatchedMovie(101, "Movie B");
    const m3 = seedWatchedMovie(102, "Movie C");
    const m4 = seedWatchedMovie(103, "Movie D");

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: "S" },
        { movieId: m2, tier: "A" },
        { movieId: m3, tier: "C" },
        { movieId: m4, tier: "D" },
      ],
    });

    // 4 movies → 4*3/2 = 6 pairwise comparisons
    expect(result.comparisonsRecorded).toBe(6);
  });

  it("higher tier movie gets higher score after submission", () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedWatchedMovie(100, "Top Movie");
    const m2 = seedWatchedMovie(101, "Bottom Movie");

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: "S" },
        { movieId: m2, tier: "D" },
      ],
    });

    const topChange = result.scoreChanges.find((s) => s.movieId === m1);
    const bottomChange = result.scoreChanges.find((s) => s.movieId === m2);

    expect(topChange?.newScore).toBeDefined();
    expect(bottomChange?.newScore).toBeDefined();
    expect((topChange?.newScore ?? 0) > (bottomChange?.newScore ?? 0)).toBe(true);
  });

  it("same-tier movies get draw comparisons", () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedWatchedMovie(100, "Movie A");
    const m2 = seedWatchedMovie(101, "Movie B");

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: "A" },
        { movieId: m2, tier: "A" },
      ],
    });

    expect(result.comparisonsRecorded).toBe(1);

    // Both should have equal or near-equal scores (mid draw = 0.5)
    const s1 = result.scoreChanges.find((s) => s.movieId === m1);
    const s2 = result.scoreChanges.find((s) => s.movieId === m2);
    expect(s1?.newScore).toBeDefined();
    expect(s2?.newScore).toBeDefined();
    expect(Math.abs((s1?.newScore ?? 0) - (s2?.newScore ?? 0))).toBeLessThan(1);
  });

  it("sets tier overrides for each placement", () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedWatchedMovie(100, "Movie A");
    const m2 = seedWatchedMovie(101, "Movie B");

    submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: "S" },
        { movieId: m2, tier: "C" },
      ],
    });

    const override1 = getTierOverrideForMedia("movie", m1, dimId);
    const override2 = getTierOverrideForMedia("movie", m2, dimId);

    expect(override1?.tier).toBe("S");
    expect(override2?.tier).toBe("C");
  });

  it("rejects inactive dimension", () => {
    const dimId = seedDimension(db, { name: "Inactive", active: 0 });
    const m1 = seedWatchedMovie(100, "Movie A");
    const m2 = seedWatchedMovie(101, "Movie B");

    expect(() =>
      submitTierList({
        dimensionId: dimId,
        placements: [
          { movieId: m1, tier: "S" },
          { movieId: m2, tier: "A" },
        ],
      })
    ).toThrow("Validation failed");
  });

  it("rejects non-existent dimension", () => {
    const m1 = seedWatchedMovie(100, "Movie A");
    const m2 = seedWatchedMovie(101, "Movie B");

    expect(() =>
      submitTierList({
        dimensionId: 999,
        placements: [
          { movieId: m1, tier: "S" },
          { movieId: m2, tier: "A" },
        ],
      })
    ).toThrow();
  });

  it("returns score changes for all placed movies", () => {
    const dimId = seedDimension(db, { name: "Overall" });
    const m1 = seedWatchedMovie(100, "Movie A");
    const m2 = seedWatchedMovie(101, "Movie B");

    const result = submitTierList({
      dimensionId: dimId,
      placements: [
        { movieId: m1, tier: "S" },
        { movieId: m2, tier: "D" },
      ],
    });

    expect(result.scoreChanges).toHaveLength(2);
    for (const change of result.scoreChanges) {
      expect(change.oldScore).toBe(1500.0);
      expect(change.movieId).toBeGreaterThan(0);
    }
  });
});
