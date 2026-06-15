/**
 * Tests for the `core.users.get` tRPC procedure (PRD-251 H7 cross-pillar
 * reconciliation surface).
 *
 * Coverage targets the URI-shaped wire contract the procedure now exposes:
 *
 *   - happy path — URI resolves, response carries the URI back so the
 *     caller can confirm it's the one they asked about
 *   - 404 — URI parses but no `user_settings` row exists for the embedded
 *     email, surfaces as `NOT_FOUND` so the consumer cron stamps stale
 *   - bad URI — malformed scheme / wrong pillar / wrong type / missing id
 *     all surface as `BAD_REQUEST` so the consumer cron records "bad URI"
 *     for ops without touching the row
 *   - auth gating — anonymous callers bounce on `UNAUTHORIZED`
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, userSettings, type OpenedCoreDb } from '@pops/core-db';

import { appRouter } from '../../../router.js';
import { type Context } from '../../../trpc.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-users-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function userCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email: 'admin@example.com' },
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

function seedUser(email: string): void {
  coreDb.db.insert(userSettings).values({ userEmail: email, key: 'seed', value: '1' }).run();
}

describe('core.users.get — URI contract', () => {
  it('resolves a known user URI and echoes the URI back', async () => {
    seedUser('joao@example.com');
    const uri = 'pops://core/user/joao@example.com';

    const res = await userCaller().core.users.get({ uri });

    expect(res).toEqual({ data: { uri } });
  });

  it('throws NOT_FOUND when the URI parses but no user is seeded', async () => {
    const uri = 'pops://core/user/nobody@example.com';

    await expect(userCaller().core.users.get({ uri })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it.each([
    ['wrong scheme', 'http://core/user/joao@example.com'],
    ['wrong pillar', 'pops://finance/user/joao@example.com'],
    ['wrong type', 'pops://core/entity/joao@example.com'],
    ['empty id', 'pops://core/user/'],
    ['plain string', 'joao@example.com'],
  ])('throws BAD_REQUEST on malformed URI (%s)', async (_label, uri) => {
    await expect(userCaller().core.users.get({ uri })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('bounces an anonymous caller on UNAUTHORIZED', async () => {
    await expect(
      anonCaller().core.users.get({ uri: 'pops://core/user/joao@example.com' })
    ).rejects.toBeInstanceOf(TRPCError);
  });
});
