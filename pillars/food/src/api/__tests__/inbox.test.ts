/**
 * Integration tests for the `inbox.*` REST surface — recipe-ingest triage
 * (PRD-134/135/136/138). Pure DB reads/writes; mutations + inspector return
 * the service's discriminated result on 200. Draft scoring / cursor maths
 * live in the db-layer tests; here we assert the wire envelopes + the
 * empty/not-found paths.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-inbox-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('inbox REST — empty-queue reads', () => {
  it('reports an empty pending count and no failed error codes', async () => {
    const api = client();
    expect(await api.inbox.pendingCount()).toEqual({ count: 0 });
    expect(await api.inbox.failedErrorCodes()).toEqual({ items: [] });
  });

  it('returns empty paginated lists', async () => {
    const api = client();
    expect(await api.inbox.list()).toEqual({ items: [], nextCursor: null });
    expect(await api.inbox.listRejected()).toEqual({ items: [], nextCursor: null });
    expect(await api.inbox.listFailed()).toEqual({ items: [], nextCursor: null });
  });
});

describe('inbox REST — mutation + inspector guards', () => {
  it('reports VersionNotFound when approving a missing version', async () => {
    expect(await client().inbox.approve(999999)).toEqual({
      ok: false,
      reason: 'VersionNotFound',
    });
  });

  it('reports NoteRequired when rejecting with reason=other and no note', async () => {
    const res = await client().inbox.reject(999999, 'other');
    expect(res).toMatchObject({ ok: false });
  });

  it('reports SourceNotFound for an unknown inspector source', async () => {
    expect(await client().inbox.getForReview(999999)).toEqual({
      ok: false,
      reason: 'SourceNotFound',
    });
  });
});
