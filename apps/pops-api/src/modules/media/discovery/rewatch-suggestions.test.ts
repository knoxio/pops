/**
 * Rewatch suggestions service tests — uses real in-memory SQLite.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import { setupTestContext, seedMovie, seedWatchHistoryEntry } from "../../../shared/test-utils.js";
import { getRewatchSuggestions } from "./service.js";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

/** Seed a comparison dimension and return its id. */
function seedDimension(db: Database, name: string): number {
  const result = db.prepare("INSERT INTO comparison_dimensions (name) VALUES (?)").run(name);
  return Number(result.lastInsertRowid);
}

/** Seed a media score entry. */
function seedMediaScore(
  db: Database,
  opts: { mediaType: string; mediaId: number; dimensionId: number; score: number }
) {
  db.prepare(
    `INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count)
     VALUES (@mediaType, @mediaId, @dimensionId, @score, 5)`
  ).run(opts);
}

/** Return a date string N months ago in ISO format. */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

describe("getRewatchSuggestions", () => {
  it("returns empty when no watch history", () => {
    const results = getRewatchSuggestions();
    expect(results).toEqual([]);
  });

  it("excludes movies watched less than 6 months ago", () => {
    const movieId = seedMovie(db, { tmdb_id: 100, title: "Recent", vote_average: 8.0 });
    seedWatchHistoryEntry(db, { media_id: movieId, watched_at: monthsAgo(3) });

    const results = getRewatchSuggestions();
    expect(results).toEqual([]);
  });

  it("includes movies watched 6+ months ago", () => {
    const movieId = seedMovie(db, { tmdb_id: 200, title: "Old Favourite", vote_average: 8.0 });
    seedWatchHistoryEntry(db, { media_id: movieId, watched_at: monthsAgo(7) });

    const results = getRewatchSuggestions();
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Old Favourite");
    expect(results[0]!.inLibrary).toBe(true);
  });

  it("filters to above-median score using voteAverage fallback", () => {
    // 4 movies: voteAverage 9, 7, 5, 3. Median of 4 items is index 2 = 5.
    // Above-median (>= 5): 9, 7, 5
    const ids = [
      seedMovie(db, { tmdb_id: 1, title: "Great", vote_average: 9.0 }),
      seedMovie(db, { tmdb_id: 2, title: "Good", vote_average: 7.0 }),
      seedMovie(db, { tmdb_id: 3, title: "Okay", vote_average: 5.0 }),
      seedMovie(db, { tmdb_id: 4, title: "Bad", vote_average: 3.0 }),
    ];
    for (const id of ids) {
      seedWatchHistoryEntry(db, { media_id: id, watched_at: monthsAgo(8) });
    }

    const results = getRewatchSuggestions();
    const titles = results.map((r) => r.title);
    expect(titles).toContain("Great");
    expect(titles).toContain("Good");
    expect(titles).not.toContain("Bad");
  });

  it("excludes movies rewatched recently even if first watched 6+ months ago", () => {
    const movieId = seedMovie(db, { tmdb_id: 300, title: "Rewatched Recently", vote_average: 9.0 });
    // First watched 12 months ago
    seedWatchHistoryEntry(db, { media_id: movieId, watched_at: monthsAgo(12) });
    // Rewatched 2 months ago — should NOT appear
    seedWatchHistoryEntry(db, {
      media_id: movieId,
      watched_at: monthsAgo(2),
    });

    const results = getRewatchSuggestions();
    expect(results).toEqual([]);
  });

  it("uses ELO score when available instead of voteAverage", () => {
    const dimId = seedDimension(db, "overall");
    const movieA = seedMovie(db, { tmdb_id: 10, title: "High ELO", vote_average: 3.0 });
    const movieB = seedMovie(db, { tmdb_id: 11, title: "Low ELO", vote_average: 9.0 });

    seedWatchHistoryEntry(db, { media_id: movieA, watched_at: monthsAgo(7) });
    seedWatchHistoryEntry(db, { media_id: movieB, watched_at: monthsAgo(7) });

    seedMediaScore(db, { mediaType: "movie", mediaId: movieA, dimensionId: dimId, score: 1800 });
    seedMediaScore(db, { mediaType: "movie", mediaId: movieB, dimensionId: dimId, score: 1200 });

    const results = getRewatchSuggestions();
    // High ELO should rank first even though its voteAverage is lower
    expect(results[0]!.title).toBe("High ELO");
    expect(results[0]!.eloScore).toBe(1800);
  });

  it("sorts by score descending", () => {
    const ids = [
      seedMovie(db, { tmdb_id: 30, title: "Third", vote_average: 5.0 }),
      seedMovie(db, { tmdb_id: 31, title: "First", vote_average: 9.0 }),
      seedMovie(db, { tmdb_id: 32, title: "Second", vote_average: 7.0 }),
    ];
    for (const id of ids) {
      seedWatchHistoryEntry(db, { media_id: id, watched_at: monthsAgo(8) });
    }

    const results = getRewatchSuggestions();
    expect(results[0]!.title).toBe("First");
    expect(results[1]!.title).toBe("Second");
  });

  it("limits results to 20", () => {
    for (let i = 0; i < 30; i++) {
      const id = seedMovie(db, { tmdb_id: 1000 + i, title: `Movie ${i}`, vote_average: 8.0 });
      seedWatchHistoryEntry(db, { media_id: id, watched_at: monthsAgo(12) });
    }

    const results = getRewatchSuggestions();
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it("includes posterUrl when posterPath is present", () => {
    const movieId = seedMovie(db, {
      tmdb_id: 500,
      title: "Has Poster",
      vote_average: 8.0,
      poster_path: "/abc.jpg",
    });
    seedWatchHistoryEntry(db, { media_id: movieId, watched_at: monthsAgo(7) });

    const results = getRewatchSuggestions();
    expect(results[0]!.posterUrl).toBe("/media/images/movie/500/poster.jpg");
  });

  it("returns null posterUrl when posterPath is null", () => {
    const movieId = seedMovie(db, {
      tmdb_id: 501,
      title: "No Poster",
      vote_average: 8.0,
      poster_path: null,
    });
    seedWatchHistoryEntry(db, { media_id: movieId, watched_at: monthsAgo(7) });

    const results = getRewatchSuggestions();
    expect(results[0]!.posterUrl).toBeNull();
  });
});
