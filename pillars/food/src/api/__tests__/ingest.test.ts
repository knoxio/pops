/**
 * Integration tests for the `ingest.*` REST surface + the binary
 * ingest-media serve routes.
 *
 * These run WITHOUT Redis. The BullMQ producer (`getFoodIngestQueue`)
 * returns `null` when no Redis env is set, so:
 *
 *   - `start` / `retry` map the resulting `IngestQueueUnavailable` to 503;
 *   - `status` / `list` / `cancel` degrade to DB-only reads;
 *   - `workerComplete` is DB-only and exercises the real draft-creation
 *     transaction end to end.
 *
 * Queue-live behaviour (job timings, cancel of a queued job) is out of
 * scope here — it needs a Redis fixture and lives with the worker suite.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ingestSourcesService, type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { writeScreenshotPayload } from '../modules/ingest/ingest-storage.js';
import { HttpError, makeClient } from './test-utils.js';

const INTERNAL_TOKEN = 'test-internal-token';
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const META = { extractor_version: 'test', stages: {} };

let tmpDir: string;
let foodDb: OpenedFoodDb;

function app() {
  return createFoodApiApp({
    foodDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3005',
  });
}

function client(): ReturnType<typeof makeClient> {
  return makeClient(app());
}

function seedSource(kind: 'text' | 'screenshot' = 'text'): number {
  const row = ingestSourcesService.createIngestSource(foodDb.db, {
    kind,
    extractorVersion: 'test',
    caption: kind === 'text' ? 'seed body' : null,
  });
  return row.id;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-ingest-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  process.env['FOOD_INGEST_DIR'] = join(tmpDir, 'ingest');
  process.env['POPS_API_INTERNAL_TOKEN'] = INTERNAL_TOKEN;
  delete process.env['REDIS_URL'];
  delete process.env['REDIS_HOST'];
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['FOOD_INGEST_DIR'];
  delete process.env['POPS_API_INTERNAL_TOKEN'];
});

describe('ingest REST — no-Redis degradation', () => {
  it('answers 503 when starting a job with no queue configured', async () => {
    await expect(client().ingest.start({ kind: 'text', body: 'a soup' })).rejects.toMatchObject({
      status: 503,
    });
  });

  it('rolls back the source row when enqueue fails (no phantom pending rows)', async () => {
    await expect(client().ingest.start({ kind: 'text', body: 'a soup' })).rejects.toBeInstanceOf(
      HttpError
    );
    expect(await client().ingest.list()).toMatchObject({ items: [] });
  });

  it('returns null status for an unknown source', async () => {
    expect(await client().ingest.status(999_999)).toBeNull();
  });

  it('reports not-cancellable for an unknown / unqueued source', async () => {
    expect(await client().ingest.cancel(999_999)).toEqual({ ok: false, reason: 'not-cancellable' });
  });

  it('answers 503 retrying a persisted source with no queue', async () => {
    const sourceId = seedSource('text');
    await expect(client().ingest.retry(sourceId)).rejects.toMatchObject({ status: 503 });
  });
});

describe('ingest REST — workerComplete (DB-only)', () => {
  it('creates an uncompiled draft recipe on success', async () => {
    const sourceId = seedSource('text');
    const res = await client().ingest.workerComplete(
      { sourceId, ok: true, dsl: '@recipe(title="Tomato Soup")', meta: META },
      INTERNAL_TOKEN
    );
    expect(res).toMatchObject({ ok: true, compileStatus: 'uncompiled' });
    if (!res.ok) throw new Error('expected ok');
    expect(res.draftRecipeId).toBeGreaterThan(0);

    const status = await client().ingest.status(sourceId);
    expect(status?.draftRecipeId).toBe(res.draftRecipeId);
  });

  it('is idempotent — a second success returns the same draft', async () => {
    const sourceId = seedSource('text');
    const body = {
      sourceId,
      ok: true as const,
      dsl: '@recipe(title="Tomato Soup")',
      meta: META,
    };
    const first = await client().ingest.workerComplete(body, INTERNAL_TOKEN);
    const second = await client().ingest.workerComplete(body, INTERNAL_TOKEN);
    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect(second.draftRecipeId).toBe(first.draftRecipeId);
  });

  it('records the error code on a failure callback', async () => {
    const sourceId = seedSource('text');
    const res = await client().ingest.workerComplete(
      {
        sourceId,
        ok: false,
        errorCode: 'vision-failed',
        errorMessage: 'the model declined',
        meta: META,
      },
      INTERNAL_TOKEN
    );
    expect(res).toEqual({ ok: false, reason: 'vision-failed' });
  });

  it('rejects the callback without the internal token', async () => {
    const sourceId = seedSource('text');
    await expect(
      client().ingest.workerComplete(
        { sourceId, ok: true, dsl: '@recipe(title="X")', meta: META }
        // no token
      )
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('ingest media serve routes', () => {
  it('400s on a non-numeric source id', async () => {
    const res = await supertest(app()).get('/ingest/source/abc/screenshot');
    expect(res.status).toBe(400);
  });

  it('404s when the source row does not exist', async () => {
    const res = await supertest(app()).get('/ingest/source/999999/screenshot');
    expect(res.status).toBe(404);
  });

  it('serves the screenshot bytes for a real, unarchived source', async () => {
    const sourceId = seedSource('screenshot');
    writeScreenshotPayload(sourceId, 'image/png', PNG_BASE64);
    const res = await supertest(app()).get(`/ingest/source/${sourceId}/screenshot`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('404s for video when none was written', async () => {
    const sourceId = seedSource('screenshot');
    const res = await supertest(app()).get(`/ingest/source/${sourceId}/video`);
    expect(res.status).toBe(404);
  });
});
