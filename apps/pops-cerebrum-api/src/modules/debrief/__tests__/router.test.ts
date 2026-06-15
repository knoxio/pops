/**
 * Tests for the `cerebrum.debrief.*` write surface (PRD-248 US-02).
 *
 * Two layers of coverage:
 *
 *   1. tRPC caller smoke — drives `appRouter.createCaller(ctx)` against
 *      a per-test in-memory cerebrum.db. Locks in the wire shapes and
 *      idempotency contract that PRD-248 US-05's media call-sites are
 *      about to consume.
 *
 *   2. HTTP wire smoke — boots the Express app via `createCerebrumApiApp`
 *      and exercises one round-trip per procedure over `/trpc` with
 *      supertest. Proves the procedures are routable, that the zod
 *      output validation is wired up, and that the dev-context fallback
 *      authenticates the caller as a human.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type CerebrumDb,
  debriefResults,
  debriefSessions,
  openCerebrumDb,
  type OpenedCerebrumDb,
} from '@pops/cerebrum-db';
import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';

import { createCerebrumApiApp } from '../../../app.js';
import { appRouter } from '../../../router.js';
import { type Context } from '../../../trpc.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-debrief-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function userCaller(email = 'user@example.com'): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email },
    serviceAccount: null,
    coreDb: coreDb.db,
    cerebrumDb: cerebrumDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: null,
    coreDb: coreDb.db,
    cerebrumDb: cerebrumDb.db,
  };
  return appRouter.createCaller(ctx);
}

interface SeedSessionInput {
  watchHistoryId: number;
  mediaType?: 'movie' | 'episode';
  mediaId?: number;
  status?: 'pending' | 'active' | 'complete';
}

function seedSession(db: CerebrumDb, input: SeedSessionInput): number {
  const result = db
    .insert(debriefSessions)
    .values({
      watchHistoryId: input.watchHistoryId,
      mediaType: input.mediaType ?? 'movie',
      mediaId: input.mediaId ?? 42,
      status: input.status ?? 'pending',
    })
    .run();
  return Number(result.lastInsertRowid);
}

describe('cerebrum.debrief.record (tRPC caller)', () => {
  it('inserts a debrief result for an existing session', async () => {
    const sessionId = seedSession(cerebrumDb.db, { watchHistoryId: 1 });
    const result = await userCaller().cerebrum.debrief.record({
      sessionId,
      dimensionId: 7,
      comparisonId: 99,
    });
    expect(result.data.sessionId).toBe(sessionId);
    expect(result.data.dimensionId).toBe(7);
    expect(result.data.comparisonId).toBe(99);
    expect(typeof result.data.id).toBe('number');
    expect(typeof result.data.createdAt).toBe('string');
  });

  it('persists the result row in cerebrum.db', async () => {
    const sessionId = seedSession(cerebrumDb.db, { watchHistoryId: 1 });
    await userCaller().cerebrum.debrief.record({
      sessionId,
      dimensionId: 3,
      comparisonId: null,
    });
    const rows = cerebrumDb.db
      .select()
      .from(debriefResults)
      .where(eq(debriefResults.sessionId, sessionId))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dimensionId).toBe(3);
    expect(rows[0]?.comparisonId).toBeNull();
  });

  it('throws NOT_FOUND for a non-existent session', async () => {
    await expect(
      userCaller().cerebrum.debrief.record({
        sessionId: 9_999,
        dimensionId: 1,
        comparisonId: null,
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'NOT_FOUND' });
  });

  it('rejects malformed input at the zod boundary (BAD_REQUEST)', async () => {
    await expect(
      userCaller().cerebrum.debrief.record({
        sessionId: 0,
        dimensionId: 1,
        comparisonId: null,
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'BAD_REQUEST' });
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    await expect(
      anonCaller().cerebrum.debrief.record({
        sessionId: 1,
        dimensionId: 1,
        comparisonId: null,
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'UNAUTHORIZED' });
  });
});

describe('cerebrum.debrief.create (tRPC caller)', () => {
  it('inserts a pending session pinned to the watch_history id', async () => {
    const result = await userCaller().cerebrum.debrief.create({
      watchHistoryId: 100,
      mediaType: 'movie',
      mediaId: 200,
    });
    expect(result.data.watchHistoryId).toBe(100);
    expect(result.data.mediaType).toBe('movie');
    expect(result.data.mediaId).toBe(200);
    expect(result.data.status).toBe('pending');
  });

  it('deletes prior pending/active sessions for the same media tuple', async () => {
    const oldSessionId = seedSession(cerebrumDb.db, {
      watchHistoryId: 50,
      mediaType: 'movie',
      mediaId: 200,
      status: 'pending',
    });
    const oldActiveId = seedSession(cerebrumDb.db, {
      watchHistoryId: 50,
      mediaType: 'movie',
      mediaId: 200,
      status: 'active',
    });

    const created = await userCaller().cerebrum.debrief.create({
      watchHistoryId: 60,
      mediaType: 'movie',
      mediaId: 200,
    });

    const remaining = cerebrumDb.db
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.mediaId, 200))
      .all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(created.data.id);
    expect(remaining[0]?.id).not.toBe(oldSessionId);
    expect(remaining[0]?.id).not.toBe(oldActiveId);
  });

  it('leaves prior complete sessions for the same media tuple untouched', async () => {
    const completedId = seedSession(cerebrumDb.db, {
      watchHistoryId: 50,
      mediaType: 'episode',
      mediaId: 300,
      status: 'complete',
    });

    const created = await userCaller().cerebrum.debrief.create({
      watchHistoryId: 60,
      mediaType: 'episode',
      mediaId: 300,
    });

    const rows = cerebrumDb.db
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.mediaId, 300))
      .all();
    expect(rows.map((r) => r.id).toSorted((a, b) => a - b)).toEqual(
      [completedId, created.data.id].toSorted((a, b) => a - b)
    );
  });

  it('is idempotent on retry — back-to-back calls converge on one pending row', async () => {
    const first = await userCaller().cerebrum.debrief.create({
      watchHistoryId: 70,
      mediaType: 'movie',
      mediaId: 400,
    });
    const second = await userCaller().cerebrum.debrief.create({
      watchHistoryId: 70,
      mediaType: 'movie',
      mediaId: 400,
    });

    const rows = cerebrumDb.db
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.mediaId, 400))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(second.data.id);
    expect(first.data.id).not.toBe(second.data.id);
  });

  it('rejects malformed input at the zod boundary (BAD_REQUEST)', async () => {
    await expect(
      userCaller().cerebrum.debrief.create({
        watchHistoryId: 0,
        mediaType: 'movie',
        mediaId: 1,
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'BAD_REQUEST' });
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    await expect(
      anonCaller().cerebrum.debrief.create({
        watchHistoryId: 1,
        mediaType: 'movie',
        mediaId: 1,
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'UNAUTHORIZED' });
  });
});

describe('cerebrum.debrief.logWatchCompletion (tRPC caller)', () => {
  it('inserts a pending session and reports dimensionsQueued=0', async () => {
    const result = await userCaller().cerebrum.debrief.logWatchCompletion({
      watchHistoryId: 11,
      mediaType: 'movie',
      mediaId: 22,
    });
    expect(typeof result.sessionId).toBe('number');
    expect(result.sessionId).toBeGreaterThan(0);
    expect(result.dimensionsQueued).toBe(0);

    const rows = cerebrumDb.db
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.id, result.sessionId))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.watchHistoryId).toBe(11);
    expect(rows[0]?.mediaType).toBe('movie');
    expect(rows[0]?.mediaId).toBe(22);
    expect(rows[0]?.status).toBe('pending');
  });

  it('is idempotent on retry — second call replaces the prior pending session', async () => {
    const first = await userCaller().cerebrum.debrief.logWatchCompletion({
      watchHistoryId: 33,
      mediaType: 'episode',
      mediaId: 44,
    });
    const second = await userCaller().cerebrum.debrief.logWatchCompletion({
      watchHistoryId: 33,
      mediaType: 'episode',
      mediaId: 44,
    });

    const rows = cerebrumDb.db
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.mediaId, 44))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(second.sessionId);
    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it('rejects malformed input at the zod boundary (BAD_REQUEST)', async () => {
    await expect(
      userCaller().cerebrum.debrief.logWatchCompletion({
        watchHistoryId: -1,
        mediaType: 'movie',
        mediaId: 1,
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'BAD_REQUEST' });
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    await expect(
      anonCaller().cerebrum.debrief.logWatchCompletion({
        watchHistoryId: 1,
        mediaType: 'movie',
        mediaId: 1,
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'UNAUTHORIZED' });
  });
});

describe('/trpc HTTP surface', () => {
  function makeApp(): ReturnType<typeof createCerebrumApiApp> {
    return createCerebrumApiApp({ cerebrumDb, coreDb, version: '0.0.1-test' });
  }

  it('answers cerebrum.debrief.create over HTTP', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/trpc/cerebrum.debrief.create')
      .send({ watchHistoryId: 1, mediaType: 'movie', mediaId: 2 })
      .set('content-type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.result.data.data.watchHistoryId).toBe(1);
    expect(res.body.result.data.data.status).toBe('pending');
  });

  it('answers cerebrum.debrief.logWatchCompletion over HTTP', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/trpc/cerebrum.debrief.logWatchCompletion')
      .send({ watchHistoryId: 5, mediaType: 'episode', mediaId: 6 })
      .set('content-type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.result.data.dimensionsQueued).toBe(0);
    expect(res.body.result.data.sessionId).toBeGreaterThan(0);
  });

  it('returns NOT_FOUND for record against a missing session over HTTP', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/trpc/cerebrum.debrief.record')
      .send({ sessionId: 1_234_567, dimensionId: 1, comparisonId: null })
      .set('content-type', 'application/json');
    expect(res.status).toBe(404);
    expect(res.body.error.data.code).toBe('NOT_FOUND');
  });
});
