/**
 * Integration tests for the migrated `media.shelfImpressions.*` tRPC
 * surface inside pops-media-api (Phase 5 PR 1 / Track M3).
 *
 * Two layers of coverage:
 *
 *   1. tRPC caller smoke — drives `appRouter.createCaller(ctx)` against
 *      a per-test in-memory media.db. Asserts the happy-path round-trip
 *      (record → list → freshness), the UNAUTHORIZED gate when no user
 *      principal is in context, NOT_FOUND when asking for the freshness
 *      of an unseen shelf, BAD_REQUEST when input fails the zod boundary,
 *      and the cleanup retention boundary (CONFLICT-style branch is not
 *      meaningful here because impressions are append-only; the analogous
 *      "second cleanup is a no-op" idempotency assertion stands in).
 *
 *   2. HTTP wire smoke — boots the Express app via `createMediaApiApp`
 *      and round-trips one mutation over `/trpc` with supertest. Proves
 *      `createExpressMiddleware` is wired up and the context factory
 *      resolves the dev-user fallback.
 *
 * Service-layer invariants (cleanup window, freshness floor) already live
 * in `packages/media-db/src/__tests__/shelf-impressions.test.ts` —
 * duplicating them here would just re-test the DB.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '@pops/media-db';

import { createMediaApiApp } from '../app.js';
import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

let tmpDir: string;
let mediaDb: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-shelf-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function userCaller(email = 'admin@example.com'): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email },
    mediaDb: mediaDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    mediaDb: mediaDb.db,
  };
  return appRouter.createCaller(ctx);
}

describe('media.shelfImpressions (tRPC caller)', () => {
  it('round-trips record → getRecentImpressions → getShelfFreshness for an authenticated user', async () => {
    const caller = userCaller();

    const recordAck = await caller.media.shelfImpressions.recordImpressions({
      shelfIds: ['trending-tmdb', 'because-you-watched:42', 'trending-tmdb'],
    });
    expect(recordAck).toEqual({ ok: true, recorded: 3 });

    const recent = await caller.media.shelfImpressions.getRecentImpressions({ days: 7 });
    expect(recent.windowDays).toBe(7);
    const byId = new Map(recent.entries.map((e) => [e.shelfId, e.impressionCount]));
    expect(byId.get('trending-tmdb')).toBe(2);
    expect(byId.get('because-you-watched:42')).toBe(1);

    const fresh = await caller.media.shelfImpressions.getShelfFreshness({
      shelfId: 'trending-tmdb',
      days: 7,
    });
    expect(fresh.shelfId).toBe('trending-tmdb');
    expect(fresh.impressionCount).toBe(2);
    expect(fresh.freshness).toBeCloseTo(1 / 3, 6);
  });

  it('cleanup is idempotent (safe to call twice in a row)', async () => {
    const caller = userCaller();
    await caller.media.shelfImpressions.recordImpressions({ shelfIds: ['shelf-x'] });
    await expect(caller.media.shelfImpressions.cleanup()).resolves.toEqual({ ok: true });
    await expect(caller.media.shelfImpressions.cleanup()).resolves.toEqual({ ok: true });

    const recent = await caller.media.shelfImpressions.getRecentImpressions({ days: 7 });
    expect(recent.entries.find((e) => e.shelfId === 'shelf-x')?.impressionCount).toBe(1);
  });

  it('rejects when no principal is present (UNAUTHORIZED)', async () => {
    const anon = anonCaller();
    await expect(
      anon.media.shelfImpressions.getRecentImpressions({ days: 7 })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
    await expect(
      anon.media.shelfImpressions.recordImpressions({ shelfIds: ['nope'] })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });

  it('returns NOT_FOUND when asked for freshness of a shelf with zero impressions in the window', async () => {
    const caller = userCaller();
    await expect(
      caller.media.shelfImpressions.getShelfFreshness({ shelfId: 'never-shown', days: 7 })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
      cause: expect.objectContaining({ name: 'NotFoundError' }),
    });
  });

  it('rejects malformed input at the zod boundary', async () => {
    const caller = userCaller();

    await expect(
      caller.media.shelfImpressions.recordImpressions({ shelfIds: [] })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });

    await expect(
      caller.media.shelfImpressions.recordImpressions({ shelfIds: ['has spaces'] })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });

    await expect(
      caller.media.shelfImpressions.getRecentImpressions({ days: 0 })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });
  });

  it('preserves an existing row when recordImpressions is called with the same shelf twice in distinct sessions', async () => {
    const caller = userCaller();
    await caller.media.shelfImpressions.recordImpressions({ shelfIds: ['repeat-shelf'] });
    await caller.media.shelfImpressions.recordImpressions({ shelfIds: ['repeat-shelf'] });

    const fresh = await caller.media.shelfImpressions.getShelfFreshness({
      shelfId: 'repeat-shelf',
      days: 7,
    });
    expect(fresh.impressionCount).toBe(2);
    expect(fresh.freshness).toBeCloseTo(1 / 3, 6);
  });
});

describe('/trpc HTTP surface', () => {
  function makeApp(): ReturnType<typeof createMediaApiApp> {
    return createMediaApiApp({ mediaDb, version: '0.0.1-test' });
  }

  it('answers media.shelfImpressions.getRecentImpressions over HTTP (dev context auto-authenticates)', async () => {
    const app = makeApp();
    const res = await request(app).get(
      `/trpc/media.shelfImpressions.getRecentImpressions?input=${encodeURIComponent(
        JSON.stringify({ days: 7 })
      )}`
    );
    expect(res.status).toBe(200);
    expect(res.body.result.data).toEqual({ windowDays: 7, entries: [] });
  });

  it('records an impression and reads it back over HTTP', async () => {
    const app = makeApp();
    const post = await request(app)
      .post('/trpc/media.shelfImpressions.recordImpressions')
      .set('Content-Type', 'application/json')
      .send({ shelfIds: ['wire-test'] });
    expect(post.status).toBe(200);
    expect(post.body.result.data).toEqual({ ok: true, recorded: 1 });

    const get = await request(app).get(
      `/trpc/media.shelfImpressions.getRecentImpressions?input=${encodeURIComponent(
        JSON.stringify({ days: 7 })
      )}`
    );
    expect(get.status).toBe(200);
    const entries = get.body.result.data.entries as Array<{
      shelfId: string;
      impressionCount: number;
    }>;
    expect(entries).toEqual([{ shelfId: 'wire-test', impressionCount: 1 }]);
  });
});
