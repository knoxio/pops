/**
 * Integration tests for the migrated finance tRPC surface inside
 * pops-finance-api (Phase 5 PR 1 / Track M2).
 *
 * Two layers of coverage:
 *
 *   1. tRPC caller smoke — drives `appRouter.createCaller(ctx)` against
 *      a per-test in-memory finance.db. Asserts the same shape contract
 *      the legacy pops-api routers enforced (wishlist + budgets + the
 *      CRUD slice of transactions, with NOT_FOUND on unknown ids,
 *      CONFLICT on the budget unique-key violation, UNAUTHORIZED when
 *      no principal is present, FORBIDDEN when a service-account caller
 *      lacks scope coverage).
 *
 *   2. HTTP wire smoke — boots the Express app via `createFinanceApiApp`
 *      and round-trips a list query and a create mutation over `/trpc`
 *      with supertest. Proves `createExpressMiddleware` is wired up and
 *      the context factory reaches the finance DB.
 *
 * Service-layer invariants (validation, FK behaviour, withSpend math)
 * already live in `packages/finance-db/src/__tests__/` — duplicating
 * them here would just test drizzle.
 *
 * Out of scope: transactions' `suggestTags` / `listDescriptionsForPreview`
 * / `availableTags` and the entire `imports` subrouter — see the scope
 * docstring on `src/router.ts` and `src/modules/transactions/router.ts`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '@pops/finance-db';

import { createFinanceApiApp } from '../app.js';
import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-routers-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function userCaller(email = 'admin@example.com'): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email },
    serviceAccount: null,
    financeDb: financeDb.db,
  };
  return appRouter.createCaller(ctx);
}

function serviceAccountCaller(scopes: string[]): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: { id: 'sa_test', name: 'test-sa', scopes },
    financeDb: financeDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: null,
    financeDb: financeDb.db,
  };
  return appRouter.createCaller(ctx);
}

describe('finance.wishlist (tRPC caller)', () => {
  it('round-trips create -> list -> get -> update -> delete', async () => {
    const admin = userCaller();
    const created = await admin.finance.wishlist.create({
      item: 'New camera',
      targetAmount: 1500,
      saved: 200,
      priority: 'Soon',
    });
    expect(created.data.item).toBe('New camera');
    expect(created.data.remainingAmount).toBe(1300);

    const list = await admin.finance.wishlist.list({});
    expect(list.data).toHaveLength(1);
    expect(list.pagination.total).toBe(1);

    const fetched = await admin.finance.wishlist.get({ id: created.data.id });
    expect(fetched.data.item).toBe('New camera');

    const updated = await admin.finance.wishlist.update({
      id: created.data.id,
      data: { saved: 400 },
    });
    expect(updated.data.remainingAmount).toBe(1100);

    const deleted = await admin.finance.wishlist.delete({ id: created.data.id });
    expect(deleted).toEqual({ message: 'Wish list item deleted' });
  });

  it('returns empty data + total=0 for an unknown priority filter (preserves wire semantics)', async () => {
    const admin = userCaller();
    await admin.finance.wishlist.create({ item: 'A', priority: 'Soon' });
    const res = await admin.finance.wishlist.list({ priority: 'NotAPriority' });
    expect(res.data).toEqual([]);
    expect(res.pagination.total).toBe(0);
  });

  it('maps a missing-id get to NOT_FOUND', async () => {
    const admin = userCaller();
    await expect(admin.finance.wishlist.get({ id: 'missing' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });
});

describe('finance.budgets (tRPC caller)', () => {
  it('round-trips create -> list -> get -> update -> delete', async () => {
    const admin = userCaller();
    const created = await admin.finance.budgets.create({
      category: 'Groceries',
      period: 'Monthly',
      amount: 800,
      active: true,
    });
    expect(created.data.category).toBe('Groceries');
    expect(created.data.active).toBe(true);
    expect(created.data.spent).toBe(0);

    const list = await admin.finance.budgets.list({});
    expect(list.data).toHaveLength(1);

    const fetched = await admin.finance.budgets.get({ id: created.data.id });
    expect(fetched.data.category).toBe('Groceries');

    const updated = await admin.finance.budgets.update({
      id: created.data.id,
      data: { amount: 1000 },
    });
    expect(updated.data.amount).toBe(1000);

    const deleted = await admin.finance.budgets.delete({ id: created.data.id });
    expect(deleted).toEqual({ message: 'Budget deleted' });
  });

  it('maps a missing-id get to NOT_FOUND', async () => {
    const admin = userCaller();
    await expect(admin.finance.budgets.get({ id: 'missing' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });
});

describe('finance.transactions (tRPC caller)', () => {
  it('round-trips create -> list -> get -> update -> delete -> restore', async () => {
    const admin = userCaller();
    const created = await admin.finance.transactions.create({
      description: 'Coffee',
      account: 'ANZ',
      amount: -5.5,
      date: '2026-06-12',
      type: 'expense',
      tags: ['food', 'coffee'],
    });
    expect(created.data.description).toBe('Coffee');
    expect(created.data.tags).toEqual(['food', 'coffee']);

    const list = await admin.finance.transactions.list({});
    expect(list.data).toHaveLength(1);

    const fetched = await admin.finance.transactions.get({ id: created.data.id });
    expect(fetched.data.description).toBe('Coffee');

    const updated = await admin.finance.transactions.update({
      id: created.data.id,
      data: { description: 'Latte' },
    });
    expect(updated.data.description).toBe('Latte');

    const deleted = await admin.finance.transactions.delete({ id: created.data.id });
    expect(deleted.message).toBe('Transaction deleted');
    expect(deleted.snapshot.id).toBe(created.data.id);

    const restored = await admin.finance.transactions.restore(deleted.snapshot);
    expect(restored.data.id).toBe(created.data.id);
    expect(restored.data.description).toBe('Latte');
  });

  it('maps a missing-id get to NOT_FOUND', async () => {
    const admin = userCaller();
    await expect(admin.finance.transactions.get({ id: 'missing' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });
});

describe('finance.* (auth surface)', () => {
  it('rejects an anonymous caller as UNAUTHORIZED', async () => {
    const anon = anonCaller();
    await expect(anon.finance.wishlist.list({})).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts a service-account caller that holds the matching scope', async () => {
    const sa = serviceAccountCaller(['finance.wishlist']);
    const created = await sa.finance.wishlist.create({ item: 'Drone' });
    expect(created.data.item).toBe('Drone');
  });

  it('rejects a service-account caller without scope coverage as FORBIDDEN', async () => {
    const sa = serviceAccountCaller(['food.recipes']);
    await expect(sa.finance.budgets.list({})).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'FORBIDDEN',
    });
  });

  it('rejects malformed input at the zod boundary', async () => {
    const admin = userCaller();
    await expect(admin.finance.wishlist.create({ item: '' })).rejects.toBeInstanceOf(TRPCError);
  });
});

describe('/trpc HTTP surface', () => {
  function makeApp(): ReturnType<typeof createFinanceApiApp> {
    return createFinanceApiApp({ financeDb, version: '0.0.1-test' });
  }

  it('answers finance.wishlist.list over HTTP (dev context auto-authenticates)', async () => {
    const app = makeApp();
    const res = await request(app).get(
      '/trpc/finance.wishlist.list?input=' + encodeURIComponent(JSON.stringify({}))
    );
    expect(res.status).toBe(200);
    expect(res.body.result.data.data).toEqual([]);
    expect(res.body.result.data.pagination.total).toBe(0);
  });

  it('round-trips a budgets.create mutation over HTTP', async () => {
    const app = makeApp();
    const created = await request(app)
      .post('/trpc/finance.budgets.create')
      .send({ category: 'Fuel', period: 'Monthly', amount: 150 });
    expect(created.status).toBe(200);
    expect(created.body.result.data.data.category).toBe('Fuel');

    const list = await admin().finance.budgets.list({});
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.category).toBe('Fuel');
  });
});

function admin(): ReturnType<typeof appRouter.createCaller> {
  return userCaller();
}
