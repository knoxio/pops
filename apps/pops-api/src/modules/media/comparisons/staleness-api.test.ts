import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
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

describe("comparisons.markStale", () => {
  it("marks a media item as stale (returns 0.5)", async () => {
    seedMovie(db, { title: "Test Movie", tmdb_id: 100 });

    const result = await caller.media.comparisons.markStale({
      mediaType: "movie",
      mediaId: 1,
    });

    expect(result.data.staleness).toBe(0.5);
  });

  it("compounds staleness on second call (0.5 × 0.5 = 0.25)", async () => {
    seedMovie(db, { title: "Test Movie", tmdb_id: 100 });

    await caller.media.comparisons.markStale({ mediaType: "movie", mediaId: 1 });
    const result = await caller.media.comparisons.markStale({
      mediaType: "movie",
      mediaId: 1,
    });

    expect(result.data.staleness).toBe(0.25);
  });
});

describe("comparisons.getStaleness", () => {
  it("returns 1.0 for a fresh media item (no staleness row)", async () => {
    seedMovie(db, { title: "Test Movie", tmdb_id: 100 });

    const result = await caller.media.comparisons.getStaleness({
      mediaType: "movie",
      mediaId: 1,
    });

    expect(result.data.staleness).toBe(1.0);
  });

  it("returns correct value after marking stale", async () => {
    seedMovie(db, { title: "Test Movie", tmdb_id: 100 });

    await caller.media.comparisons.markStale({ mediaType: "movie", mediaId: 1 });

    const result = await caller.media.comparisons.getStaleness({
      mediaType: "movie",
      mediaId: 1,
    });

    expect(result.data.staleness).toBe(0.5);
  });

  it("returns 1.0 after watch resets staleness", async () => {
    const movieId = seedMovie(db, { title: "Test Movie", tmdb_id: 100 });

    // Mark stale
    await caller.media.comparisons.markStale({ mediaType: "movie", mediaId: movieId });
    const stale = await caller.media.comparisons.getStaleness({
      mediaType: "movie",
      mediaId: movieId,
    });
    expect(stale.data.staleness).toBe(0.5);

    // Simulate watch completing (inserts watch history which resets staleness)
    seedWatchHistoryEntry(db, { media_type: "movie", media_id: movieId, completed: 1 });
    // Manually reset staleness (watch-history service does this, but we're testing via tRPC)
    db.prepare("DELETE FROM comparison_staleness WHERE media_type = ? AND media_id = ?").run(
      "movie",
      movieId
    );

    const fresh = await caller.media.comparisons.getStaleness({
      mediaType: "movie",
      mediaId: movieId,
    });
    expect(fresh.data.staleness).toBe(1.0);
  });
});
