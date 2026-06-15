/**
 * Tests for the `core.settings.*` tRPC router mounted on pops-core-api
 * (PRD-247 US-01 / US-03).
 *
 * Coverage:
 *
 *   - Happy paths for every procedure (`get`, `set`, `ensure`, `delete`,
 *     `getMany`, `setMany`).
 *   - `set` upsert semantics — second write replaces value, key stays.
 *   - `ensure` upsert-and-return — second call returns the persisted
 *     row unchanged (write-once semantics).
 *   - `getMany` — the Plex hot-path shape: a single request resolves
 *     every requested key, missing ones are omitted, `[]` returns `{}`.
 *   - `setMany` — transactional mirror of the input, overwrites
 *     existing rows.
 *   - Validation errors at the zod boundary, exercised over the HTTP
 *     wire so the test does not have to lie about the input type.
 *   - Missing-key behaviour — `get` returns `null`, `delete` throws
 *     NOT_FOUND, `getMany` omits.
 *   - Auth gating — anonymous callers bounce on UNAUTHORIZED.
 *
 * The tests run against an in-memory core.db opened per-test via
 * `openCoreDb`. Service-layer invariants (drizzle CRUD, transactions)
 * already live in `packages/core-db/src/__tests__/settings.test.ts`;
 * this suite tests the wire seam only.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';
import { SETTINGS_KEYS } from '@pops/types';

import { createCoreApiApp } from '../../../app.js';
import { appRouter } from '../../../router.js';
import { type Context } from '../../../trpc.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-settings-test-'));
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

const PLEX_TOKEN_KEY = SETTINGS_KEYS.PLEX_TOKEN;
const PLEX_USERNAME_KEY = SETTINGS_KEYS.PLEX_USERNAME;
const PLEX_URL_KEY = SETTINGS_KEYS.PLEX_URL;

describe('core.settings.get', () => {
  it('returns the row when the key is set', async () => {
    const caller = userCaller();
    await caller.core.settings.set({ key: PLEX_TOKEN_KEY, value: 'tok-1' });

    const res = await caller.core.settings.get({ key: PLEX_TOKEN_KEY });
    expect(res.data).toEqual({ key: PLEX_TOKEN_KEY, value: 'tok-1' });
  });

  it('returns null when the key is missing', async () => {
    const caller = userCaller();
    const res = await caller.core.settings.get({ key: PLEX_TOKEN_KEY });
    expect(res.data).toBeNull();
  });
});

describe('core.settings.set', () => {
  it('upserts a new key', async () => {
    const caller = userCaller();
    const res = await caller.core.settings.set({ key: PLEX_TOKEN_KEY, value: 'tok-1' });
    expect(res.data).toEqual({ key: PLEX_TOKEN_KEY, value: 'tok-1' });
    expect(res.message).toBe('Setting saved');
  });

  it('overwrites an existing value', async () => {
    const caller = userCaller();
    await caller.core.settings.set({ key: PLEX_TOKEN_KEY, value: 'tok-1' });
    const res = await caller.core.settings.set({ key: PLEX_TOKEN_KEY, value: 'tok-2' });
    expect(res.data.value).toBe('tok-2');

    const fetched = await caller.core.settings.get({ key: PLEX_TOKEN_KEY });
    expect(fetched.data?.value).toBe('tok-2');
  });
});

describe('core.settings.ensure — write-once upsert-and-return', () => {
  it('inserts when the key is missing and returns the persisted row', async () => {
    const caller = userCaller();
    const res = await caller.core.settings.ensure({ key: PLEX_TOKEN_KEY, value: 'seed-1' });
    expect(res.data).toEqual({ key: PLEX_TOKEN_KEY, value: 'seed-1' });
  });

  it('returns the existing row unchanged when the key already exists', async () => {
    const caller = userCaller();
    await caller.core.settings.ensure({ key: PLEX_TOKEN_KEY, value: 'seed-1' });
    const res = await caller.core.settings.ensure({
      key: PLEX_TOKEN_KEY,
      value: 'would-overwrite',
    });
    expect(res.data.value).toBe('seed-1');
  });
});

describe('core.settings.delete', () => {
  it('deletes an existing key', async () => {
    const caller = userCaller();
    await caller.core.settings.set({ key: PLEX_TOKEN_KEY, value: 'tok-1' });
    const res = await caller.core.settings.delete({ key: PLEX_TOKEN_KEY });
    expect(res.message).toBe('Setting deleted');

    const after = await caller.core.settings.get({ key: PLEX_TOKEN_KEY });
    expect(after.data).toBeNull();
  });

  it('throws NOT_FOUND for a missing key', async () => {
    const caller = userCaller();
    await expect(caller.core.settings.delete({ key: PLEX_TOKEN_KEY })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });
});

describe('core.settings.getMany — Plex hot-path shape', () => {
  it('returns every requested key that exists, omitting missing keys', async () => {
    const caller = userCaller();
    await caller.core.settings.set({ key: PLEX_TOKEN_KEY, value: 'tok-1' });
    await caller.core.settings.set({ key: PLEX_USERNAME_KEY, value: 'alice' });

    const res = await caller.core.settings.getMany({
      keys: [PLEX_TOKEN_KEY, PLEX_USERNAME_KEY, PLEX_URL_KEY],
    });
    expect(res.settings).toEqual({
      [PLEX_TOKEN_KEY]: 'tok-1',
      [PLEX_USERNAME_KEY]: 'alice',
    });
    expect(PLEX_URL_KEY in res.settings).toBe(false);
  });

  it('returns {} for an empty keys array', async () => {
    const caller = userCaller();
    const res = await caller.core.settings.getMany({ keys: [] });
    expect(res.settings).toEqual({});
  });

  it('returns {} when no requested key exists', async () => {
    const caller = userCaller();
    const res = await caller.core.settings.getMany({
      keys: [PLEX_TOKEN_KEY, PLEX_USERNAME_KEY],
    });
    expect(res.settings).toEqual({});
  });
});

describe('core.settings.setMany — transactional batch write', () => {
  it('writes every entry and returns the mirror', async () => {
    const caller = userCaller();
    const res = await caller.core.settings.setMany({
      entries: [
        { key: PLEX_TOKEN_KEY, value: 'tok-1' },
        { key: PLEX_USERNAME_KEY, value: 'alice' },
      ],
    });
    expect(res.settings).toEqual({
      [PLEX_TOKEN_KEY]: 'tok-1',
      [PLEX_USERNAME_KEY]: 'alice',
    });

    const read = await caller.core.settings.getMany({
      keys: [PLEX_TOKEN_KEY, PLEX_USERNAME_KEY],
    });
    expect(read.settings).toEqual({
      [PLEX_TOKEN_KEY]: 'tok-1',
      [PLEX_USERNAME_KEY]: 'alice',
    });
  });

  it('returns {} for an empty entries array', async () => {
    const caller = userCaller();
    const res = await caller.core.settings.setMany({ entries: [] });
    expect(res.settings).toEqual({});
  });

  it('overwrites pre-existing keys inside the batch', async () => {
    const caller = userCaller();
    await caller.core.settings.set({ key: PLEX_TOKEN_KEY, value: 'old' });
    const res = await caller.core.settings.setMany({
      entries: [
        { key: PLEX_TOKEN_KEY, value: 'new' },
        { key: PLEX_USERNAME_KEY, value: 'alice' },
      ],
    });
    expect(res.settings[PLEX_TOKEN_KEY]).toBe('new');
    expect(res.settings[PLEX_USERNAME_KEY]).toBe('alice');
  });
});

describe('core.settings.* auth gating', () => {
  it('rejects an anonymous caller with UNAUTHORIZED', async () => {
    const anon = anonCaller();
    await expect(anon.core.settings.get({ key: PLEX_TOKEN_KEY })).rejects.toBeInstanceOf(TRPCError);
    await expect(anon.core.settings.getMany({ keys: [PLEX_TOKEN_KEY] })).rejects.toBeInstanceOf(
      TRPCError
    );
  });
});

describe('core.settings.* validation — HTTP wire', () => {
  function makeApp(): ReturnType<typeof createCoreApiApp> {
    return createCoreApiApp({
      coreDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3001',
    });
  }

  it('rejects an unknown single-key value with BAD_REQUEST', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/trpc/core.settings.get')
      .query({ input: JSON.stringify({ key: 'not-a-real-key' }) });
    expect(res.status).toBe(400);
    expect(res.body.error.data.code).toBe('BAD_REQUEST');
  });

  it('rejects a malformed getMany payload with BAD_REQUEST', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/trpc/core.settings.getMany')
      .query({ input: JSON.stringify({ keys: 'not-an-array' }) });
    expect(res.status).toBe(400);
    expect(res.body.error.data.code).toBe('BAD_REQUEST');
  });
});
