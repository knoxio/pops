/**
 * PRD-125 — integration tests for `food.ingest.*` procedures.
 *
 * Uses an in-memory SQLite seeded with the food migrations (PRDs 106–116)
 * and stubs out the BullMQ queue to capture the enqueued jobs without
 * needing a live Redis. The food.ingest queue helper is mocked at the
 * module level; the rest of the router runs against the real DB so the
 * transactional `workerComplete` flow (createRecipe + compileRecipeVersion
 * + ingest_sources update) is exercised end-to-end.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { appRouter } from '../../../router.js';

import type { Context } from '../../../trpc.js';

interface CapturedJob {
  id: string;
  data: unknown;
  name: string;
}

const enqueuedJobs: CapturedJob[] = [];
let nextJobIdCounter = 0;
let queueDisabled = false;

vi.mock('../queue.js', async () => {
  const actual = await vi.importActual<typeof import('../queue.js')>('../queue.js');
  return {
    ...actual,
    getFoodIngestQueue: () => {
      if (queueDisabled) return null;
      return {
        async add(name: string, data: unknown) {
          const id = String(++nextJobIdCounter);
          enqueuedJobs.push({ id, data, name });
          return { id };
        },
        async getJobs(_states: readonly string[], _start: number, _end: number) {
          return enqueuedJobs.map((j) => ({
            id: j.id,
            data: j.data,
            getState: async () => 'waiting' as const,
            processedOn: null,
            finishedOn: null,
            remove: async () => {
              const idx = enqueuedJobs.findIndex((other) => other.id === j.id);
              if (idx >= 0) enqueuedJobs.splice(idx, 1);
            },
          }));
        },
      };
    },
    closeFoodIngestQueue: async () => {},
  };
});

const FOOD_MIGRATIONS = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0061_shocking_skreet.sql',
  '0062_chemical_donald_blake.sql',
  '0063_bumpy_wolverine.sql',
  '0064_peaceful_magma.sql',
  '0065_prd_116_recipe_compile.sql',
  '0066_prd_123_conversions.sql',
  '0067_prd_125_ingest_error_columns.sql',
];

function applyMigrations(db: Database): void {
  for (const name of FOOD_MIGRATIONS) {
    const sql = readFileSync(join(__dirname, '../../../db/drizzle-migrations', name), 'utf8');
    const statements = sql.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) db.exec(trimmed);
    }
  }
}

function createInternalCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = { user: null, serviceAccount: null, internalCaller: true };
  return appRouter.createCaller(ctx);
}

function createPublicCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email: 'test@example.com' },
    serviceAccount: null,
    internalCaller: false,
  };
  return appRouter.createCaller(ctx);
}

let db: Database;
let ingestDirRoot: string;

beforeEach(() => {
  enqueuedJobs.length = 0;
  nextJobIdCounter = 0;
  queueDisabled = false;
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  setDb(db);
  ingestDirRoot = mkdtempSync(join(tmpdir(), 'pops-food-ingest-'));
  process.env['FOOD_INGEST_DIR'] = ingestDirRoot;
  // Internal-token enabled for workerComplete tests; cleared per-case as needed.
  process.env['POPS_API_INTERNAL_TOKEN'] = 'test-internal-token';
  // Redis env required to keep the queue helper non-null in non-mocked paths.
  process.env['REDIS_HOST'] ??= 'localhost';
});

afterEach(() => {
  closeDb();
  rmSync(ingestDirRoot, { recursive: true, force: true });
});

describe('food.ingest.start', () => {
  it('enqueues a url-web job and writes ingest_sources row', async () => {
    const caller = createPublicCaller();
    const result = await caller.food.ingest.start({
      kind: 'url-web',
      url: 'https://example.com/recipe',
    });
    expect(result.sourceId).toBeGreaterThan(0);
    expect(result.jobId).toBeTruthy();
    const rows = db.prepare(`SELECT * FROM ingest_sources WHERE id = ?`).all(result.sourceId) as {
      kind: string;
      url: string | null;
      attempts: number;
    }[];
    expect(rows[0]?.kind).toBe('url-web');
    expect(rows[0]?.url).toBe('https://example.com/recipe');
    expect(rows[0]?.attempts).toBe(0);
    expect(enqueuedJobs.length).toBe(1);
  });

  it('writes screenshot to disk before enqueue', async () => {
    const caller = createPublicCaller();
    const tinyPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009077533d0000000a49444154789c63f8cf00000200012b14ad3e0000000049454e44ae426082',
      'hex'
    );
    const result = await caller.food.ingest.start({
      kind: 'screenshot',
      mimeType: 'image/png',
      contentBase64: tinyPng.toString('base64'),
    });
    const fileExists = readFileSync(join(ingestDirRoot, String(result.sourceId), 'screenshot.png'));
    expect(fileExists.length).toBe(tinyPng.length);
    expect(enqueuedJobs[0]?.data).toMatchObject({
      kind: 'screenshot',
      contentPath: `${result.sourceId}/screenshot.png`,
    });
  });

  it('rejects malformed urls with InvalidIngestInput', async () => {
    const caller = createPublicCaller();
    await expect(caller.food.ingest.start({ kind: 'url-web', url: 'not-a-url' })).rejects.toThrow();
  });

  it('returns SERVICE_UNAVAILABLE when Redis is down', async () => {
    queueDisabled = true;
    const caller = createPublicCaller();
    await expect(
      caller.food.ingest.start({ kind: 'text', body: 'Smash burger recipe' })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

describe('food.ingest.retry', () => {
  it('reuses sourceId, increments attempts, clears error', async () => {
    const caller = createPublicCaller();
    const first = await caller.food.ingest.start({
      kind: 'url-web',
      url: 'https://example.com/r',
    });
    db.prepare(`UPDATE ingest_sources SET error_code = 'X', error_message = 'Y' WHERE id = ?`).run(
      first.sourceId
    );
    const retry = await caller.food.ingest.retry({ sourceId: first.sourceId });
    expect(retry.jobId).not.toBe(first.jobId);
    const row = db
      .prepare(`SELECT attempts, error_code FROM ingest_sources WHERE id = ?`)
      .get(first.sourceId) as { attempts: number; error_code: string | null };
    expect(row.attempts).toBe(1);
    expect(row.error_code).toBeNull();
  });
});

describe('food.ingest.cancel', () => {
  it('removes the BullMQ job when still waiting', async () => {
    const caller = createPublicCaller();
    const started = await caller.food.ingest.start({
      kind: 'text',
      body: 'Test recipe text',
    });
    const cancelled = await caller.food.ingest.cancel({ sourceId: started.sourceId });
    expect(cancelled).toEqual({ ok: true });
    expect(enqueuedJobs.length).toBe(0);
  });

  it('returns not-cancellable when no job exists for the sourceId', async () => {
    const caller = createPublicCaller();
    const cancelled = await caller.food.ingest.cancel({ sourceId: 99999 });
    expect(cancelled).toEqual({ ok: false, reason: 'not-cancellable' });
  });
});

describe('food.ingest.workerComplete', () => {
  it('rejects calls without the internal token', async () => {
    const caller = createPublicCaller();
    await expect(
      caller.food.ingest.workerComplete({
        sourceId: 1,
        ok: false,
        errorCode: 'X',
        errorMessage: 'Y',
        meta: { extractor_version: 'v1', stages: {} },
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('persists failure rollup to ingest_sources on ok: false', async () => {
    const publicCaller = createPublicCaller();
    const started = await publicCaller.food.ingest.start({
      kind: 'text',
      body: 'A recipe',
    });
    const caller = createInternalCaller();
    const result = await caller.food.ingest.workerComplete({
      sourceId: started.sourceId,
      ok: false,
      errorCode: 'EMPTY_EXTRACTION',
      errorMessage: 'LLM produced no ingredients',
      meta: { extractor_version: 'v1', stages: { llm: { ok: false } } },
    });
    expect(result).toEqual({ ok: false, reason: 'EMPTY_EXTRACTION' });
    const row = db
      .prepare(`SELECT error_code, extracted_json FROM ingest_sources WHERE id = ?`)
      .get(started.sourceId) as { error_code: string; extracted_json: string };
    expect(row.error_code).toBe('EMPTY_EXTRACTION');
    expect(JSON.parse(row.extracted_json).extractor_version).toBe('v1');
  });

  it('creates recipe + version + ingest_sources update on ok: true', async () => {
    const publicCaller = createPublicCaller();
    const started = await publicCaller.food.ingest.start({
      kind: 'text',
      body: 'A recipe',
    });
    const caller = createInternalCaller();
    const dsl = '@recipe smash-burger "Smash burger"\n@yield 4 burger\n@step\nSear patties.';
    const result = await caller.food.ingest.workerComplete({
      sourceId: started.sourceId,
      ok: true,
      dsl,
      meta: { extractor_version: 'v1', stages: { dsl_build: { ok: true } } },
    });
    if (!result.ok) throw new Error('expected ok=true');
    expect(result.draftRecipeId).toBeGreaterThan(0);
    const sourceRow = db
      .prepare(`SELECT draft_recipe_id FROM ingest_sources WHERE id = ?`)
      .get(started.sourceId) as { draft_recipe_id: number };
    expect(sourceRow.draft_recipe_id).toBe(result.draftRecipeId);
    const versionRow = db
      .prepare(`SELECT body_dsl, source_id FROM recipe_versions WHERE recipe_id = ?`)
      .get(result.draftRecipeId) as { body_dsl: string; source_id: number | null };
    expect(versionRow.body_dsl).toContain('Sear patties');
    expect(versionRow.source_id).toBe(started.sourceId);
  });

  it('persists partialReason inside extracted_json so status can recover it', async () => {
    const publicCaller = createPublicCaller();
    const started = await publicCaller.food.ingest.start({
      kind: 'url-instagram',
      url: 'https://instagram.com/p/abc',
    });
    const caller = createInternalCaller();
    const dsl = '@recipe(slug=foo, title="Partial")\n@yield 1 thing';
    const result = await caller.food.ingest.workerComplete({
      sourceId: started.sourceId,
      ok: true,
      dsl,
      meta: { extractor_version: 'v1', stages: { stt: { ok: false } } },
      partialReason: 'stt-failed',
    });
    if (!result.ok) throw new Error('expected ok=true');
    const row = db
      .prepare(`SELECT extracted_json FROM ingest_sources WHERE id = ?`)
      .get(started.sourceId) as { extracted_json: string };
    const parsed = JSON.parse(row.extracted_json) as { partialReason: string };
    expect(parsed.partialReason).toBe('stt-failed');
  });

  it('derives title from @recipe(... title="...") not a missing @title token', async () => {
    const publicCaller = createPublicCaller();
    const started = await publicCaller.food.ingest.start({
      kind: 'text',
      body: 'A recipe',
    });
    const caller = createInternalCaller();
    const dsl =
      '@recipe(slug=carbonara, title="Spaghetti carbonara")\n@yield 2 plates\n@step\nWhisk.';
    const result = await caller.food.ingest.workerComplete({
      sourceId: started.sourceId,
      ok: true,
      dsl,
      meta: { extractor_version: 'v1', stages: {} },
    });
    if (!result.ok) throw new Error('expected ok=true');
    const versionRow = db
      .prepare(`SELECT title FROM recipe_versions WHERE recipe_id = ?`)
      .get(result.draftRecipeId) as { title: string };
    expect(versionRow.title).toBe('Spaghetti carbonara');
  });

  it('rejects partialReason values outside the closed enum', async () => {
    const publicCaller = createPublicCaller();
    const started = await publicCaller.food.ingest.start({ kind: 'text', body: 'r' });
    const caller = createInternalCaller();
    await expect(
      caller.food.ingest.workerComplete({
        sourceId: started.sourceId,
        ok: true,
        dsl: '@recipe(slug=r, title="r")\n@yield 1 x',
        meta: { extractor_version: 'v1', stages: {} },
        // @ts-expect-error — runtime rejection test for the Zod enum gate
        partialReason: 'made-up-reason',
      })
    ).rejects.toThrow();
  });

  it('throws when sourceId does not exist (no silent UPDATE)', async () => {
    const caller = createInternalCaller();
    await expect(
      caller.food.ingest.workerComplete({
        sourceId: 99999,
        ok: false,
        errorCode: 'X',
        errorMessage: 'Y',
        meta: { extractor_version: 'v1', stages: {} },
      })
    ).rejects.toThrow();
  });

  it('is idempotent on ok=true — second call returns the same draftRecipeId', async () => {
    const publicCaller = createPublicCaller();
    const started = await publicCaller.food.ingest.start({ kind: 'text', body: 'r' });
    const caller = createInternalCaller();
    const dsl = '@recipe(slug=idem, title="Idempotent")\n@yield 1 x';
    const first = await caller.food.ingest.workerComplete({
      sourceId: started.sourceId,
      ok: true,
      dsl,
      meta: { extractor_version: 'v1', stages: {} },
    });
    if (!first.ok) throw new Error('expected ok=true');
    const second = await caller.food.ingest.workerComplete({
      sourceId: started.sourceId,
      ok: true,
      dsl,
      meta: { extractor_version: 'v1', stages: {} },
    });
    if (!second.ok) throw new Error('expected ok=true');
    expect(second.draftRecipeId).toBe(first.draftRecipeId);
    // Single recipe row — no duplicate slug insert.
    const recipeCount = (db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get() as { n: number }).n;
    expect(recipeCount).toBe(1);
  });
});

describe('food.ingest.start rollback', () => {
  it('removes the ingest_sources row when enqueue fails', async () => {
    queueDisabled = true;
    const caller = createPublicCaller();
    const before = (db.prepare(`SELECT COUNT(*) AS n FROM ingest_sources`).get() as { n: number })
      .n;
    await expect(
      caller.food.ingest.start({ kind: 'text', body: 'A recipe' })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    const after = (db.prepare(`SELECT COUNT(*) AS n FROM ingest_sources`).get() as { n: number }).n;
    expect(after).toBe(before);
  });
});
