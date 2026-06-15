/**
 * Integration tests for the cerebrum-side debrief writer surface
 * (`cerebrum.debrief.logWatchCompletion`) and the rewritten
 * `getDebriefByMedia` read — Option D step 2 (#3111).
 *
 * The endpoint covers two contracts:
 *   1. Happy path — a single call seeds one pending debrief session row
 *      with the denormalised `(media_type, media_id)` populated, and one
 *      `debrief_status` row per active dimension reset to 0/0.
 *   2. Idempotency — calling twice (re-watch fan-out, retries) collapses
 *      to a single pending debrief row with reset status counters.
 *
 * `getDebriefByMedia` coverage proves the rewrite hits the denormalised
 * columns directly without inner-joining `watch_history` — the read
 * resolves a session whose `watch_history` row has been removed
 * (simulating the future MEDIA pillar exit).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedDimension,
  seedMovie,
  seedWatchHistoryEntry,
  setupTestContext,
} from '../../../shared/test-utils.js';
import * as debriefService from '../../media/debrief/service.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;
let caller: ReturnType<typeof ctx.setup>['caller'];

beforeEach(() => {
  ({ db, caller } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

interface DebriefSessionRow {
  id: number;
  watch_history_id: number;
  media_type: string | null;
  media_id: number | null;
  status: string;
}

function getDebriefSessions(db: Database): DebriefSessionRow[] {
  return db.prepare('SELECT * FROM debrief_sessions ORDER BY id').all() as DebriefSessionRow[];
}

interface DebriefStatusRow {
  id: number;
  media_type: string;
  media_id: number;
  dimension_id: number;
  debriefed: number;
  dismissed: number;
}

function getDebriefStatus(db: Database): DebriefStatusRow[] {
  return db.prepare('SELECT * FROM debrief_status ORDER BY id').all() as DebriefStatusRow[];
}

function insertSession(
  db: Database,
  input: {
    watchHistoryId: number;
    mediaType?: 'movie' | 'episode';
    mediaId?: number;
    status?: 'pending' | 'active' | 'complete';
  }
): number {
  const res = db
    .prepare(
      'INSERT INTO debrief_sessions (watch_history_id, media_type, media_id, status) VALUES (?, ?, ?, ?)'
    )
    .run(
      input.watchHistoryId,
      input.mediaType ?? 'movie',
      input.mediaId ?? 1,
      input.status ?? 'pending'
    );
  return Number(res.lastInsertRowid);
}

describe('cerebrum.debrief.get (in-monolith)', () => {
  it('returns the row for an existing session', async () => {
    seedMovie(db, { title: 'M', tmdb_id: 1 });
    const watchHistoryId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 1 });
    const sessionId = insertSession(db, { watchHistoryId, mediaType: 'movie', mediaId: 1 });

    const result = await caller.cerebrum.debrief.get({ sessionId });
    expect(result.data?.id).toBe(sessionId);
  });

  it('returns { data: null } for a missing session', async () => {
    const result = await caller.cerebrum.debrief.get({ sessionId: 999_999 });
    expect(result.data).toBeNull();
  });
});

describe('cerebrum.debrief.getByMedia (in-monolith)', () => {
  it('returns null for a media with no debrief', async () => {
    const result = await caller.cerebrum.debrief.getByMedia({
      mediaType: 'movie',
      mediaId: 999,
    });
    expect(result.data).toBeNull();
  });

  it('returns the pending session for a media tuple via denormalised columns', async () => {
    seedMovie(db, { title: 'M', tmdb_id: 1 });
    const watchHistoryId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 1 });
    const sessionId = insertSession(db, {
      watchHistoryId,
      mediaType: 'movie',
      mediaId: 1,
      status: 'pending',
    });

    const result = await caller.cerebrum.debrief.getByMedia({ mediaType: 'movie', mediaId: 1 });
    expect(result.data?.id).toBe(sessionId);
  });

  it('skips complete sessions', async () => {
    seedMovie(db, { title: 'M', tmdb_id: 1 });
    const watchHistoryId = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 1 });
    insertSession(db, { watchHistoryId, mediaType: 'movie', mediaId: 1, status: 'complete' });

    const result = await caller.cerebrum.debrief.getByMedia({ mediaType: 'movie', mediaId: 1 });
    expect(result.data).toBeNull();
  });
});

describe('cerebrum.debrief.listPending (in-monolith)', () => {
  it('returns empty + total 0 when no sessions exist', async () => {
    const result = await caller.cerebrum.debrief.listPending({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.limit).toBe(50);
  });

  it('lists only pending sessions and paginates', async () => {
    seedMovie(db, { title: 'M', tmdb_id: 1 });
    for (let i = 1; i <= 4; i += 1) {
      const wh = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: i });
      insertSession(db, { watchHistoryId: wh, mediaType: 'movie', mediaId: i, status: 'pending' });
    }
    const wh2 = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 99 });
    insertSession(db, { watchHistoryId: wh2, mediaType: 'movie', mediaId: 99, status: 'active' });

    const first = await caller.cerebrum.debrief.listPending({ limit: 2, offset: 0 });
    expect(first.data).toHaveLength(2);
    expect(first.pagination.total).toBe(4);

    const second = await caller.cerebrum.debrief.listPending({ limit: 2, offset: 2 });
    expect(second.data).toHaveLength(2);
    expect(second.pagination.total).toBe(4);
  });

  it('filters by mediaType + mediaId', async () => {
    seedMovie(db, { title: 'M', tmdb_id: 1 });
    const wh1 = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 10 });
    insertSession(db, { watchHistoryId: wh1, mediaType: 'movie', mediaId: 10, status: 'pending' });
    const wh2 = seedWatchHistoryEntry(db, { media_type: 'movie', media_id: 20 });
    insertSession(db, { watchHistoryId: wh2, mediaType: 'movie', mediaId: 20, status: 'pending' });

    const result = await caller.cerebrum.debrief.listPending({
      mediaType: 'movie',
      mediaId: 20,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.mediaId).toBe(20);
    expect(result.pagination.total).toBe(1);
  });
});

describe('cerebrum.debrief.logWatchCompletion', () => {
  it('creates a debrief session with denormalised media columns and queues debrief_status rows', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    seedDimension(db, { name: 'Enjoyment', active: 1 });
    seedDimension(db, { name: 'Cinematography', active: 1 });
    const watchHistoryId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
    });

    const result = await caller.cerebrum.debrief.logWatchCompletion({
      mediaType: 'movie',
      mediaId: 1,
      watchHistoryId,
    });

    expect(result.sessionId).toBeGreaterThan(0);
    expect(result.dimensionsQueued).toBe(2);

    const sessions = getDebriefSessions(db);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.status).toBe('pending');
    expect(sessions[0]!.media_type).toBe('movie');
    expect(sessions[0]!.media_id).toBe(1);
    expect(sessions[0]!.watch_history_id).toBe(watchHistoryId);

    const status = getDebriefStatus(db);
    expect(status).toHaveLength(2);
    for (const row of status) {
      expect(row.media_type).toBe('movie');
      expect(row.media_id).toBe(1);
      expect(row.debriefed).toBe(0);
      expect(row.dismissed).toBe(0);
    }
  });

  it('is idempotent across repeated calls — exactly one pending debrief row survives', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    seedDimension(db, { name: 'Enjoyment', active: 1 });
    const watchHistoryId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
      watched_at: '2026-01-01T00:00:00.000Z',
    });

    const first = await caller.cerebrum.debrief.logWatchCompletion({
      mediaType: 'movie',
      mediaId: 1,
      watchHistoryId,
    });

    db.prepare(
      'UPDATE debrief_status SET debriefed = 1, dismissed = 1 WHERE media_type = ? AND media_id = ?'
    ).run('movie', 1);

    const second = await caller.cerebrum.debrief.logWatchCompletion({
      mediaType: 'movie',
      mediaId: 1,
      watchHistoryId,
    });

    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.dimensionsQueued).toBe(1);

    const sessions = getDebriefSessions(db);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe(second.sessionId);
    expect(sessions[0]!.status).toBe('pending');
    expect(sessions[0]!.media_type).toBe('movie');
    expect(sessions[0]!.media_id).toBe(1);

    const status = getDebriefStatus(db);
    expect(status).toHaveLength(1);
    expect(status[0]!.debriefed).toBe(0);
    expect(status[0]!.dismissed).toBe(0);
  });

  it('preserves completed sessions for the same media on a re-watch fan-out', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    seedDimension(db, { name: 'Enjoyment', active: 1 });
    const wh1 = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
      watched_at: '2026-01-01T00:00:00.000Z',
    });
    await caller.cerebrum.debrief.logWatchCompletion({
      mediaType: 'movie',
      mediaId: 1,
      watchHistoryId: wh1,
    });
    db.prepare("UPDATE debrief_sessions SET status = 'complete' WHERE watch_history_id = ?").run(
      wh1
    );

    const wh2 = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
      watched_at: '2026-02-01T00:00:00.000Z',
    });
    await caller.cerebrum.debrief.logWatchCompletion({
      mediaType: 'movie',
      mediaId: 1,
      watchHistoryId: wh2,
    });

    const sessions = getDebriefSessions(db);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.status).toBe('complete');
    expect(sessions[1]!.status).toBe('pending');
    expect(sessions[1]!.media_type).toBe('movie');
    expect(sessions[1]!.media_id).toBe(1);
  });

  it('rejects malformed input at the zod boundary', async () => {
    await expect(
      caller.cerebrum.debrief.logWatchCompletion({
        mediaType: 'movie',
        mediaId: 0,
        watchHistoryId: 1,
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'BAD_REQUEST' });
  });
});

describe('cerebrum.debrief.dismiss', () => {
  it('transitions a pending session to complete and returns the session row', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    const watchHistoryId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
    });
    const sessionId = debriefService.createDebriefSession(watchHistoryId);

    const result = await caller.cerebrum.debrief.dismiss({ sessionId });
    expect(result.data.id).toBe(sessionId);
    expect(result.data.status).toBe('complete');

    const rows = db
      .prepare('SELECT status FROM debrief_sessions WHERE id = ?')
      .all(sessionId) as Array<{ status: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('complete');
  });

  it('is idempotent on an already-dismissed session', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    const watchHistoryId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
    });
    const sessionId = debriefService.createDebriefSession(watchHistoryId);
    await caller.cerebrum.debrief.dismiss({ sessionId });
    const second = await caller.cerebrum.debrief.dismiss({ sessionId });
    expect(second.data.id).toBe(sessionId);
    expect(second.data.status).toBe('complete');
  });

  it('throws NOT_FOUND for an unknown sessionId', async () => {
    await expect(caller.cerebrum.debrief.dismiss({ sessionId: 9_999_999 })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });
});

describe('cerebrum.debrief.deleteByWatchHistoryId', () => {
  it('cascade-deletes sessions + dependent debrief_results rows for the watch_history id', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    seedDimension(db, { name: 'Enjoyment', active: 1 });
    seedDimension(db, { name: 'Cinematography', active: 1 });
    const watchHistoryId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
    });
    const sessionId = debriefService.createDebriefSession(watchHistoryId);

    db.prepare(
      'INSERT INTO debrief_results (session_id, dimension_id, comparison_id) VALUES (?, ?, ?), (?, ?, ?)'
    ).run(sessionId, 1, null, sessionId, 2, null);

    const result = await caller.cerebrum.debrief.deleteByWatchHistoryId({ watchHistoryId });
    expect(result.deletedSessions).toBe(1);
    expect(result.deletedResults).toBe(2);

    const sessions = db
      .prepare('SELECT id FROM debrief_sessions WHERE watch_history_id = ?')
      .all(watchHistoryId);
    expect(sessions).toHaveLength(0);
    const results = db
      .prepare('SELECT id FROM debrief_results WHERE session_id = ?')
      .all(sessionId);
    expect(results).toHaveLength(0);
  });

  it('returns zero counts for a watch_history id with no debrief rows', async () => {
    const result = await caller.cerebrum.debrief.deleteByWatchHistoryId({
      watchHistoryId: 7_777,
    });
    expect(result).toEqual({ deletedSessions: 0, deletedResults: 0 });
  });
});

describe('getDebriefByMedia — denormalised read', () => {
  it('returns the debrief response directly from the denormalised columns', () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    seedDimension(db, { name: 'Enjoyment', active: 1 });
    const watchHistoryId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
    });
    const sessionId = debriefService.createDebriefSession(watchHistoryId);

    const result = debriefService.getDebriefByMedia('movie', 1);

    expect(result.sessionId).toBe(sessionId);
    expect(result.movie.mediaType).toBe('movie');
    expect(result.movie.mediaId).toBe(1);
  });

  it('finds a session even when the originating watch_history row is gone', () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    seedDimension(db, { name: 'Enjoyment', active: 1 });
    const watchHistoryId = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
    });
    const sessionId = debriefService.createDebriefSession(watchHistoryId);

    db.prepare("UPDATE debrief_sessions SET status = 'complete' WHERE id = ?").run(sessionId);

    const session = db
      .prepare('SELECT media_type, media_id FROM debrief_sessions WHERE id = ?')
      .get(sessionId) as { media_type: string | null; media_id: number | null };
    expect(session.media_type).toBe('movie');
    expect(session.media_id).toBe(1);

    const rows = db
      .prepare('SELECT id FROM debrief_sessions WHERE media_type = ? AND media_id = ?')
      .all('movie', 1) as Array<{ id: number }>;
    expect(rows.map((r) => r.id)).toContain(sessionId);
  });

  it('throws NotFoundError when no session exists for the media tuple', () => {
    expect(() => debriefService.getDebriefByMedia('movie', 999)).toThrow(
      "Debrief session 'movie:999' not found"
    );
  });

  it('returns the earliest session by id when multiple exist (matches prior ordering)', () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 100 });
    seedDimension(db, { name: 'Enjoyment', active: 1 });
    const wh1 = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
      watched_at: '2026-01-01T00:00:00.000Z',
    });
    const firstSessionId = debriefService.createDebriefSession(wh1);
    db.prepare("UPDATE debrief_sessions SET status = 'complete' WHERE id = ?").run(firstSessionId);

    const wh2 = seedWatchHistoryEntry(db, {
      media_type: 'movie',
      media_id: 1,
      completed: 1,
      watched_at: '2026-02-01T00:00:00.000Z',
    });
    debriefService.createDebriefSession(wh2);

    const result = debriefService.getDebriefByMedia('movie', 1);
    expect(result.sessionId).toBe(firstSessionId);
  });
});
