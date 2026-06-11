/**
 * Integration tests for the migrated `cerebrum.nudges.*` read/dismiss
 * tRPC surface inside pops-cerebrum-api (Phase 5 PR 1 / Track M5).
 *
 * Two layers of coverage:
 *
 *   1. tRPC caller smoke — drives `appRouter.createCaller(ctx)` against
 *      a per-test in-memory cerebrum.db. Locks in the shape contract the
 *      legacy pops-api router enforced (list / get / dismiss /
 *      contradictions) and the new wire-shape error split for dismiss
 *      (NOT_FOUND vs CONFLICT) — the legacy router collapsed both into
 *      BAD_REQUEST.
 *
 *   2. HTTP wire smoke — boots the Express app via `createCerebrumApiApp`
 *      and round-trips one query over `/trpc` with supertest. Proves
 *      `createExpressMiddleware` is wired up and the dev-context
 *      fallback authenticates the caller as a human.
 *
 * Persistence-layer invariants (cooldown dedup, pending-cap, contradiction
 * filtering at the SQL layer) already live in
 * `packages/cerebrum-db/src/__tests__/nudge-log.test.ts` — duplicating
 * them here would just test drizzle.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type CerebrumDb,
  nudgeLog,
  openCerebrumDb,
  type OpenedCerebrumDb,
} from '@pops/cerebrum-db';
import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';

import { createCerebrumApiApp } from '../app.js';
import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-nudges-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface SeedRow {
  id: string;
  type?: 'pattern' | 'staleness' | 'consolidation' | 'insight';
  status?: 'pending' | 'dismissed' | 'acted' | 'expired';
  priority?: 'low' | 'medium' | 'high';
  createdAt: string;
  actionParams?: Record<string, unknown> | null;
}

function seed(db: CerebrumDb, rows: SeedRow[]): void {
  for (const r of rows) {
    db.insert(nudgeLog)
      .values({
        id: r.id,
        type: r.type ?? 'pattern',
        title: `Title for ${r.id}`,
        body: `Body for ${r.id}`,
        engramIds: JSON.stringify(['eA', 'eB']),
        priority: r.priority ?? 'medium',
        status: r.status ?? 'pending',
        createdAt: r.createdAt,
        actionType: r.actionParams === null ? null : 'link',
        actionLabel: r.actionParams === null ? null : 'Open',
        actionParams:
          r.actionParams === null || r.actionParams === undefined
            ? null
            : JSON.stringify(r.actionParams),
      })
      .run();
  }
}

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

describe('cerebrum.nudges.list (tRPC caller)', () => {
  it('returns an empty page when no nudges are present', async () => {
    const result = await userCaller().cerebrum.nudges.list();
    expect(result).toEqual({ nudges: [], total: 0 });
  });

  it('returns rows in createdAt-desc order with a total count', async () => {
    seed(cerebrumDb.db, [
      { id: 'n_1', createdAt: '2026-06-09T10:00:00.000Z' },
      { id: 'n_2', createdAt: '2026-06-10T10:00:00.000Z' },
      { id: 'n_3', createdAt: '2026-06-11T10:00:00.000Z' },
    ]);
    const result = await userCaller().cerebrum.nudges.list();
    expect(result.total).toBe(3);
    expect(result.nudges.map((n) => n.id)).toEqual(['n_3', 'n_2', 'n_1']);
  });

  it('honours the status filter', async () => {
    seed(cerebrumDb.db, [
      { id: 'p1', status: 'pending', createdAt: '2026-06-10T10:00:00.000Z' },
      { id: 'd1', status: 'dismissed', createdAt: '2026-06-10T11:00:00.000Z' },
      { id: 'p2', status: 'pending', createdAt: '2026-06-10T12:00:00.000Z' },
    ]);
    const result = await userCaller().cerebrum.nudges.list({ status: 'pending' });
    expect(result.total).toBe(2);
    expect(result.nudges.map((n) => n.id).toSorted()).toEqual(['p1', 'p2']);
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    await expect(anonCaller().cerebrum.nudges.list()).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });
});

describe('cerebrum.nudges.get (tRPC caller)', () => {
  it('returns a known nudge wrapped in `{ nudge }`', async () => {
    seed(cerebrumDb.db, [{ id: 'n_known', createdAt: '2026-06-11T10:00:00.000Z' }]);
    const result = await userCaller().cerebrum.nudges.get({ id: 'n_known' });
    expect(result.nudge.id).toBe('n_known');
    expect(result.nudge.title).toBe('Title for n_known');
  });

  it('throws NOT_FOUND for an unknown nudge id', async () => {
    await expect(
      userCaller().cerebrum.nudges.get({ id: 'n_does_not_exist' })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
      cause: expect.objectContaining({ name: 'NotFoundError' }),
    });
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    await expect(anonCaller().cerebrum.nudges.get({ id: 'whatever' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });
});

describe('cerebrum.nudges.dismiss (tRPC caller)', () => {
  it('dismisses a pending nudge', async () => {
    seed(cerebrumDb.db, [{ id: 'd_ok', status: 'pending', createdAt: '2026-06-11T10:00:00.000Z' }]);
    const result = await userCaller().cerebrum.nudges.dismiss({ id: 'd_ok' });
    expect(result).toEqual({ success: true });
    const after = await userCaller().cerebrum.nudges.get({ id: 'd_ok' });
    expect(after.nudge.status).toBe('dismissed');
  });

  it('throws NOT_FOUND for an unknown nudge id', async () => {
    await expect(userCaller().cerebrum.nudges.dismiss({ id: 'd_missing' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });

  it('throws CONFLICT when the nudge is already dismissed', async () => {
    seed(cerebrumDb.db, [
      { id: 'd_done', status: 'dismissed', createdAt: '2026-06-11T10:00:00.000Z' },
    ]);
    await expect(userCaller().cerebrum.nudges.dismiss({ id: 'd_done' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'CONFLICT',
    });
  });

  it('throws CONFLICT when the nudge has already been acted on', async () => {
    seed(cerebrumDb.db, [
      { id: 'd_acted', status: 'acted', createdAt: '2026-06-11T10:00:00.000Z' },
    ]);
    await expect(userCaller().cerebrum.nudges.dismiss({ id: 'd_acted' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'CONFLICT',
    });
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    seed(cerebrumDb.db, [{ id: 'd_x', status: 'pending', createdAt: '2026-06-11T10:00:00.000Z' }]);
    await expect(anonCaller().cerebrum.nudges.dismiss({ id: 'd_x' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects malformed input at the zod boundary (BAD_REQUEST)', async () => {
    await expect(userCaller().cerebrum.nudges.dismiss({ id: '' })).rejects.toBeInstanceOf(
      TRPCError
    );
  });
});

describe('cerebrum.nudges.contradictions (tRPC caller)', () => {
  it('returns an empty page when no contradictions exist', async () => {
    const result = await userCaller().cerebrum.nudges.contradictions();
    expect(result).toEqual({ contradictions: [], total: 0 });
  });

  it('returns shaped rows for contradiction-pattern nudges only', async () => {
    seed(cerebrumDb.db, [
      {
        id: 'c_1',
        type: 'pattern',
        createdAt: '2026-06-11T10:00:00.000Z',
        actionParams: {
          contradiction: {
            engramA: 'engA1',
            engramB: 'engB1',
            excerptA: 'first claim',
            excerptB: 'opposite claim',
            conflict: 'they disagree on X',
          },
        },
      },
      {
        id: 'c_recurring',
        type: 'pattern',
        createdAt: '2026-06-11T11:00:00.000Z',
        actionParams: { recurring: true },
      },
      {
        id: 'c_other_type',
        type: 'staleness',
        createdAt: '2026-06-11T12:00:00.000Z',
        actionParams: {
          contradiction: {
            engramA: 'x',
            engramB: 'y',
            excerptA: 'a',
            excerptB: 'b',
            conflict: 'c',
          },
        },
      },
    ]);
    const result = await userCaller().cerebrum.nudges.contradictions();
    expect(result.total).toBe(1);
    expect(result.contradictions).toHaveLength(1);
    const [row] = result.contradictions;
    expect(row).toMatchObject({
      id: 'c_1',
      engramA: 'engA1',
      engramB: 'engB1',
      conflict: 'they disagree on X',
    });
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    await expect(anonCaller().cerebrum.nudges.contradictions()).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });
});

describe('/trpc HTTP surface', () => {
  function makeApp(): ReturnType<typeof createCerebrumApiApp> {
    return createCerebrumApiApp({ cerebrumDb, coreDb, version: '0.0.1-test' });
  }

  it('answers cerebrum.nudges.list over HTTP (dev context auto-authenticates)', async () => {
    seed(cerebrumDb.db, [
      { id: 'http_1', createdAt: '2026-06-11T10:00:00.000Z' },
      { id: 'http_2', createdAt: '2026-06-11T11:00:00.000Z' },
    ]);
    const app = makeApp();
    const res = await request(app).get('/trpc/cerebrum.nudges.list');
    expect(res.status).toBe(200);
    expect(res.body.result.data.total).toBe(2);
    expect(res.body.result.data.nudges.map((n: { id: string }) => n.id)).toEqual([
      'http_2',
      'http_1',
    ]);
  });

  it('returns a tRPC NOT_FOUND envelope for an unknown nudge over HTTP', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/trpc/cerebrum.nudges.get')
      .query({ input: JSON.stringify({ id: 'unknown' }) });
    expect(res.status).toBe(404);
    expect(res.body.error.data.code).toBe('NOT_FOUND');
  });
});
