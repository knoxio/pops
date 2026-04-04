import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Database } from "better-sqlite3";
import {
  setupTestContext,
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  seedDebriefSession,
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

describe("comparisons.dismissDebriefDimension", () => {
  function setupDebrief() {
    const movieId = seedMovie(db, { title: "Test Movie", tmdb_id: 1000 });
    const whId = seedWatchHistoryEntry(db, { media_type: "movie", media_id: movieId });
    const dim1 = seedDimension(db, { name: "Cinematography", sort_order: 0 });
    const dim2 = seedDimension(db, { name: "Entertainment", sort_order: 1 });
    const sessionId = seedDebriefSession(db, { watch_history_id: whId });
    return { movieId, whId, dim1, dim2, sessionId };
  }

  it("creates a debrief_result with null comparison_id", async () => {
    const { dim1, sessionId } = setupDebrief();

    await caller.media.comparisons.dismissDebriefDimension({
      sessionId,
      dimensionId: dim1,
    });

    const result = db
      .prepare("SELECT * FROM debrief_results WHERE session_id = ? AND dimension_id = ?")
      .get(sessionId, dim1) as { comparison_id: number | null } | undefined;

    expect(result).toBeTruthy();
    expect(result!.comparison_id).toBeNull();
  });

  it("auto-completes session when all active dimensions have results", async () => {
    const { dim1, dim2, sessionId } = setupDebrief();

    // Dismiss first dimension
    await caller.media.comparisons.dismissDebriefDimension({
      sessionId,
      dimensionId: dim1,
    });

    // Session should still be pending (2 dimensions, only 1 result)
    const sessionBefore = db
      .prepare("SELECT status FROM debrief_sessions WHERE id = ?")
      .get(sessionId) as { status: string };
    expect(sessionBefore.status).toBe("pending");

    // Dismiss second dimension
    await caller.media.comparisons.dismissDebriefDimension({
      sessionId,
      dimensionId: dim2,
    });

    // Session should now be complete
    const sessionAfter = db
      .prepare("SELECT status FROM debrief_sessions WHERE id = ?")
      .get(sessionId) as { status: string };
    expect(sessionAfter.status).toBe("complete");
  });

  it("rejects if session does not exist", async () => {
    setupDebrief();

    await expect(
      caller.media.comparisons.dismissDebriefDimension({
        sessionId: 9999,
        dimensionId: 1,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects if session is already complete", async () => {
    const { dim1, sessionId } = setupDebrief();

    // Manually mark session as complete
    db.prepare("UPDATE debrief_sessions SET status = 'complete' WHERE id = ?").run(sessionId);

    await expect(
      caller.media.comparisons.dismissDebriefDimension({
        sessionId,
        dimensionId: dim1,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects duplicate dismiss for the same dimension", async () => {
    const { dim1, sessionId } = setupDebrief();

    await caller.media.comparisons.dismissDebriefDimension({
      sessionId,
      dimensionId: dim1,
    });

    await expect(
      caller.media.comparisons.dismissDebriefDimension({
        sessionId,
        dimensionId: dim1,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("does not record a comparison", async () => {
    const { dim1, sessionId } = setupDebrief();

    const compsBefore = db.prepare("SELECT count(*) as cnt FROM comparisons").get() as {
      cnt: number;
    };

    await caller.media.comparisons.dismissDebriefDimension({
      sessionId,
      dimensionId: dim1,
    });

    const compsAfter = db.prepare("SELECT count(*) as cnt FROM comparisons").get() as {
      cnt: number;
    };

    expect(compsAfter.cnt).toBe(compsBefore.cnt);
  });
});
