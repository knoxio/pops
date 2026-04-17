import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedDebriefStatus,
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';

import type { Database } from 'better-sqlite3';

import type { createCaller } from '../../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

function seedDebriefSession(db: Database, watchHistoryId: number, status = 'pending'): number {
  const result = db
    .prepare('INSERT INTO debrief_sessions (watch_history_id, status) VALUES (?, ?)')
    .run(watchHistoryId, status);
  return Number(result.lastInsertRowid);
}

describe('comparisons.recordDebriefComparison', () => {
  it('records comparison and creates debrief_result with comparison_id', async () => {
    const dim1 = seedDimension(db, { name: 'Story' });
    seedDimension(db, { name: 'Visuals' }); // 2 dims so first doesn't auto-complete
    const movieA = seedMovie(db, { tmdb_id: 100, title: 'Debrief Movie' });
    const movieB = seedMovie(db, { tmdb_id: 101, title: 'Opponent Movie' });
    const whId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA });
    const sessionId = seedDebriefSession(db, whId);

    const result = await caller.media.comparisons.recordDebriefComparison({
      sessionId,
      dimensionId: dim1,
      opponentType: 'movie',
      opponentId: movieB,
      winnerId: movieA,
    });

    expect(result.data.comparisonId).toBeGreaterThan(0);
    expect(result.data.sessionComplete).toBe(false);

    // Verify debrief_result was created
    const dr = db
      .prepare('SELECT * FROM debrief_results WHERE session_id = ? AND dimension_id = ?')
      .get(sessionId, dim1) as { comparison_id: number };
    expect(dr.comparison_id).toBe(result.data.comparisonId);
  });

  it('skip (winnerId=0) creates debrief_result with null comparison_id', async () => {
    const dimId = seedDimension(db, { name: 'Story' });
    const movieA = seedMovie(db, { tmdb_id: 200, title: 'Movie A' });
    const movieB = seedMovie(db, { tmdb_id: 201, title: 'Movie B' });
    const whId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA });
    const sessionId = seedDebriefSession(db, whId);

    const result = await caller.media.comparisons.recordDebriefComparison({
      sessionId,
      dimensionId: dimId,
      opponentType: 'movie',
      opponentId: movieB,
      winnerId: 0,
    });

    expect(result.data.comparisonId).toBeNull();

    // Verify debrief_result has null comparison_id
    const dr = db.prepare('SELECT * FROM debrief_results WHERE session_id = ?').get(sessionId) as {
      comparison_id: number | null;
    };
    expect(dr.comparison_id).toBeNull();
  });

  it('auto-completes session when all active dimensions have results', async () => {
    const dim1 = seedDimension(db, { name: 'Story', active: 1 });
    const dim2 = seedDimension(db, { name: 'Visuals', active: 1 });
    const movieA = seedMovie(db, { tmdb_id: 300, title: 'Movie A' });
    const movieB = seedMovie(db, { tmdb_id: 301, title: 'Movie B' });
    const whId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA });
    const sessionId = seedDebriefSession(db, whId);

    // Record first dimension — not complete yet
    const r1 = await caller.media.comparisons.recordDebriefComparison({
      sessionId,
      dimensionId: dim1,
      opponentType: 'movie',
      opponentId: movieB,
      winnerId: movieA,
    });
    expect(r1.data.sessionComplete).toBe(false);

    // Record second dimension — should complete
    const r2 = await caller.media.comparisons.recordDebriefComparison({
      sessionId,
      dimensionId: dim2,
      opponentType: 'movie',
      opponentId: movieB,
      winnerId: movieB,
    });
    expect(r2.data.sessionComplete).toBe(true);

    // Verify session status
    const session = db
      .prepare('SELECT status FROM debrief_sessions WHERE id = ?')
      .get(sessionId) as { status: string };
    expect(session.status).toBe('complete');
  });

  it('activates pending session on first comparison', async () => {
    const dimId = seedDimension(db, { name: 'Story' });
    const movieA = seedMovie(db, { tmdb_id: 400, title: 'Movie A' });
    const movieB = seedMovie(db, { tmdb_id: 401, title: 'Movie B' });
    const whId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA });
    const sessionId = seedDebriefSession(db, whId, 'pending');

    await caller.media.comparisons.recordDebriefComparison({
      sessionId,
      dimensionId: dimId,
      opponentType: 'movie',
      opponentId: movieB,
      winnerId: movieA,
    });

    const session = db
      .prepare('SELECT status FROM debrief_sessions WHERE id = ?')
      .get(sessionId) as { status: string };
    // With only 1 active dimension, session should be complete
    expect(session.status).toBe('complete');
  });

  it('rejects if session is already complete', async () => {
    const dimId = seedDimension(db, { name: 'Story' });
    const movieA = seedMovie(db, { tmdb_id: 500, title: 'Movie A' });
    const movieB = seedMovie(db, { tmdb_id: 501, title: 'Movie B' });
    const whId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA });
    const sessionId = seedDebriefSession(db, whId, 'complete');

    await expect(
      caller.media.comparisons.recordDebriefComparison({
        sessionId,
        dimensionId: dimId,
        opponentType: 'movie',
        opponentId: movieB,
        winnerId: movieA,
      })
    ).rejects.toThrow();
  });

  it('rejects duplicate dimension for same session', async () => {
    const dimId = seedDimension(db, { name: 'Story' });
    seedDimension(db, { name: 'Visuals' }); // 2nd dim so first doesn't auto-complete
    const movieA = seedMovie(db, { tmdb_id: 600, title: 'Movie A' });
    const movieB = seedMovie(db, { tmdb_id: 601, title: 'Movie B' });
    const whId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA });
    const sessionId = seedDebriefSession(db, whId);

    await caller.media.comparisons.recordDebriefComparison({
      sessionId,
      dimensionId: dimId,
      opponentType: 'movie',
      opponentId: movieB,
      winnerId: movieA,
    });

    await expect(
      caller.media.comparisons.recordDebriefComparison({
        sessionId,
        dimensionId: dimId,
        opponentType: 'movie',
        opponentId: movieB,
        winnerId: movieA,
      })
    ).rejects.toThrow();
  });

  it('updates ELO scores when comparison is recorded', async () => {
    const dimId = seedDimension(db, { name: 'Story' });
    const movieA = seedMovie(db, { tmdb_id: 700, title: 'Movie A' });
    const movieB = seedMovie(db, { tmdb_id: 701, title: 'Movie B' });
    const whId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA });
    const sessionId = seedDebriefSession(db, whId);

    await caller.media.comparisons.recordDebriefComparison({
      sessionId,
      dimensionId: dimId,
      opponentType: 'movie',
      opponentId: movieB,
      winnerId: movieA,
    });

    // Check ELO scores were updated
    const scores = db
      .prepare(
        'SELECT media_id, score FROM media_scores WHERE dimension_id = ? ORDER BY score DESC'
      )
      .all(dimId) as Array<{ media_id: number; score: number }>;

    expect(scores).toHaveLength(2);
    expect(scores[0]!.media_id).toBe(movieA); // winner should have higher score
    expect(scores[0]!.score).toBeGreaterThan(1500);
    expect(scores[1]!.score).toBeLessThan(1500);
  });

  it('sets debriefed=1 on the debrief_status row', async () => {
    const dimId = seedDimension(db, { name: 'Story' });
    const movieA = seedMovie(db, { tmdb_id: 800, title: 'Movie A' });
    const movieB = seedMovie(db, { tmdb_id: 801, title: 'Movie B' });
    const whId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: movieA });
    const sessionId = seedDebriefSession(db, whId);
    seedDebriefStatus(db, { media_type: 'movie', media_id: movieA, dimension_id: dimId });

    await caller.media.comparisons.recordDebriefComparison({
      sessionId,
      dimensionId: dimId,
      opponentType: 'movie',
      opponentId: movieB,
      winnerId: movieA,
    });

    const row = db
      .prepare(
        "SELECT debriefed FROM debrief_status WHERE media_type = 'movie' AND media_id = ? AND dimension_id = ?"
      )
      .get(movieA, dimId) as { debriefed: number } | undefined;

    expect(row).toBeTruthy();
    expect(row!.debriefed).toBe(1);
  });
});
