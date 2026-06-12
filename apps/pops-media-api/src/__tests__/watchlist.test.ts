/**
 * Integration tests for the migrated `media.watchlist.*` tRPC surface
 * inside pops-media-api (PRD-167 PR 1 / Theme 13).
 *
 * Two layers of coverage:
 *
 *   1. tRPC caller smoke — drives `appRouter.createCaller(ctx)` against
 *      a per-test in-memory media.db. Asserts CRUD happy paths, the
 *      idempotent `add` branch, NOT_FOUND surfacing for missing ids,
 *      CONFLICT surfacing for duplicate reorder priorities, BAD_REQUEST
 *      at the zod boundary, and the UNAUTHORIZED gate when no user
 *      principal is in context.
 *
 *   2. HTTP wire smoke — boots the Express app via `createMediaApiApp`
 *      and round-trips one mutation over `/trpc` with supertest to prove
 *      the wiring + the dev-user fallback context resolver.
 *
 * Service-layer invariants (ordering, idempotence, resequencing) already
 * live in `packages/media-db/src/__tests__/watchlist.test.ts`.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-watchlist-test-'));
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

describe('media.watchlist (tRPC caller)', () => {
  it('round-trips add → list → status → get → update → remove', async () => {
    const caller = userCaller();

    const addResp = await caller.media.watchlist.add({
      mediaType: 'movie',
      mediaId: 550,
      priority: 1,
      notes: 'Must watch',
    });
    expect(addResp.created).toBe(true);
    expect(addResp.data.mediaType).toBe('movie');
    expect(addResp.data.mediaId).toBe(550);
    expect(addResp.data.priority).toBe(1);
    expect(addResp.data.notes).toBe('Must watch');
    expect(addResp.data.title).toBeNull();
    expect(addResp.data.posterUrl).toBeNull();

    const list = await caller.media.watchlist.list({});
    expect(list.pagination.total).toBe(1);
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.id).toBe(addResp.data.id);

    const status = await caller.media.watchlist.status({ mediaType: 'movie', mediaId: 550 });
    expect(status).toEqual({ onWatchlist: true, entryId: addResp.data.id });

    const got = await caller.media.watchlist.get({ id: addResp.data.id });
    expect(got.data.mediaId).toBe(550);

    const upd = await caller.media.watchlist.update({
      id: addResp.data.id,
      data: { priority: 9 },
    });
    expect(upd.data.priority).toBe(9);
    expect(upd.data.notes).toBe('Must watch');

    const rm = await caller.media.watchlist.remove({ id: addResp.data.id });
    expect(rm.message).toBe('Removed from watchlist');

    const after = await caller.media.watchlist.status({ mediaType: 'movie', mediaId: 550 });
    expect(after.onWatchlist).toBe(false);
  });

  it('add is idempotent on (mediaType, mediaId)', async () => {
    const caller = userCaller();
    const first = await caller.media.watchlist.add({ mediaType: 'movie', mediaId: 1 });
    const second = await caller.media.watchlist.add({ mediaType: 'movie', mediaId: 1 });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.data.id).toBe(first.data.id);
    expect(second.message).toBe('Already on watchlist');
  });

  it('list orders by priority ASC then addedAt DESC and respects mediaType filter', async () => {
    const caller = userCaller();
    await caller.media.watchlist.add({ mediaType: 'movie', mediaId: 1, priority: 2 });
    await caller.media.watchlist.add({ mediaType: 'movie', mediaId: 2, priority: 0 });
    await caller.media.watchlist.add({ mediaType: 'tv_show', mediaId: 3, priority: 1 });

    const all = await caller.media.watchlist.list({});
    expect(all.pagination.total).toBe(3);
    expect(all.data.map((r) => r.mediaId)).toEqual([2, 3, 1]);

    const movies = await caller.media.watchlist.list({ mediaType: 'movie' });
    expect(movies.pagination.total).toBe(2);
    expect(movies.data.every((r) => r.mediaType === 'movie')).toBe(true);
  });

  it('reorder updates priorities and rejects duplicates', async () => {
    const caller = userCaller();
    const a = await caller.media.watchlist.add({ mediaType: 'movie', mediaId: 1, priority: 0 });
    const b = await caller.media.watchlist.add({ mediaType: 'movie', mediaId: 2, priority: 1 });
    const c = await caller.media.watchlist.add({ mediaType: 'movie', mediaId: 3, priority: 2 });

    await caller.media.watchlist.reorder({
      items: [
        { id: c.data.id, priority: 0 },
        { id: a.data.id, priority: 1 },
        { id: b.data.id, priority: 2 },
      ],
    });
    const after = await caller.media.watchlist.list({});
    expect(after.data.map((r) => r.mediaId)).toEqual([3, 1, 2]);

    await expect(
      caller.media.watchlist.reorder({
        items: [
          { id: a.data.id, priority: 0 },
          { id: b.data.id, priority: 0 },
        ],
      })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'CONFLICT',
    });
  });

  it('returns NOT_FOUND for missing ids on get / update / remove / reorder', async () => {
    const caller = userCaller();

    await expect(caller.media.watchlist.get({ id: 9999 })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });

    await expect(
      caller.media.watchlist.update({ id: 9999, data: { priority: 1 } })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });

    await expect(caller.media.watchlist.remove({ id: 9999 })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });

    await expect(
      caller.media.watchlist.reorder({ items: [{ id: 9999, priority: 0 }] })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });

  it('rejects malformed input at the zod boundary', async () => {
    const caller = userCaller();
    await expect(
      caller.media.watchlist.add({ mediaType: 'movie', mediaId: -5 })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });
    await expect(
      caller.media.watchlist.add({
        mediaType: 'invalid' as unknown as 'movie',
        mediaId: 1,
      })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });
  });

  it('rejects when no principal is present (UNAUTHORIZED)', async () => {
    const anon = anonCaller();
    await expect(anon.media.watchlist.list({})).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
    await expect(
      anon.media.watchlist.add({ mediaType: 'movie', mediaId: 1 })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });
});

describe('/trpc HTTP surface', () => {
  function makeApp(): ReturnType<typeof createMediaApiApp> {
    return createMediaApiApp({ mediaDb, version: '0.0.1-test' });
  }

  it('adds + lists a watchlist entry over HTTP (dev context auto-authenticates)', async () => {
    const app = makeApp();

    const post = await request(app)
      .post('/trpc/media.watchlist.add')
      .set('Content-Type', 'application/json')
      .send({ mediaType: 'movie', mediaId: 42, priority: 3, notes: null });
    expect(post.status).toBe(200);
    expect(post.body.result.data.created).toBe(true);
    expect(post.body.result.data.data.mediaId).toBe(42);

    const list = await request(app).get(
      `/trpc/media.watchlist.list?input=${encodeURIComponent(JSON.stringify({}))}`
    );
    expect(list.status).toBe(200);
    expect(list.body.result.data.pagination.total).toBe(1);
    expect(list.body.result.data.data[0].mediaId).toBe(42);
  });
});
