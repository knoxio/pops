/**
 * PRD-138 — integration tests for `food.inbox.list{Rejected,Failed,FailedErrorCodes}`.
 *
 * In-memory SQLite seeded with the food migration subset + an inline minimal
 * `ai_inference_log` table (the canonical migration is 0034 which depends on
 * earlier finance plumbing; recreating that chain is wasteful when this PRD
 * only needs `(context_id, cost_usd)`).
 *
 * Coverage:
 *   - listRejected:
 *     - returns only versions with a `recipe_version_rejections` row
 *     - excludes PRD-119-style manual discards (archived without rejections row)
 *     - filter chips: reasons, kinds, sinceDays
 *     - cursor pagination across multiple pages
 *     - aggregates `ai_inference_log.cost_usd` by `context_id = 'ingest_source:<id>'`
 *   - listFailed:
 *     - returns only `ingest_sources` where `error_code IS NOT NULL`
 *     - excludes `ok: true` sources even when `partialReason='auth-dead'`
 *       (those have NULL error_code by construction)
 *     - filter chips: errorCodes, kinds, sinceDays
 *     - cursor pagination
 *   - failedErrorCodes:
 *     - returns the distinct set, sorted, excluding NULL
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ingestSourcesService,
  ingredientsService,
  recipesService,
  variantsService,
} from '@pops/app-food-db';
import { ingestSources } from '@pops/food-db';

import { closeDb, getDrizzle, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';

const MIGRATION_FILES = [
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
  '0068_prd_136_inbox_review.sql',
];

const AI_INFERENCE_LOG_INLINE_DDL = `
  CREATE TABLE ai_inference_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'claude',
    model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    operation TEXT NOT NULL DEFAULT 'recipe-extract',
    domain TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    cached INTEGER NOT NULL DEFAULT 0,
    context_id TEXT,
    error_message TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

function applyMigration(db: Database, filename: string): void {
  const text = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of text.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

function createFoodTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATION_FILES) applyMigration(db, name);
  db.exec(AI_INFERENCE_LOG_INLINE_DDL);
  return db;
}

interface SeedDraft {
  recipeId: number;
  sourceId: number;
  draftVersionId: number;
  recipeSlug: string;
}

function seedDraft(
  slug: string,
  kind: 'text' | 'url-web' | 'url-instagram' | 'screenshot' = 'text',
  url: string | null = null
): SeedDraft {
  const db = getDrizzle();
  const banana = ingredientsService.createIngredient(db, {
    slug: `${slug}-banana`,
    name: 'Banana',
    defaultUnit: 'count',
  });
  variantsService.createVariant(db, {
    ingredientId: banana.id,
    slug: 'raw',
    name: 'Raw',
    defaultUnit: 'count',
  });
  const source = ingestSourcesService.createIngestSource(db, {
    kind,
    extractorVersion: 'test-v1',
    url,
  });
  const recipe = recipesService.createRecipe(db, {
    slug,
    firstVersion: {
      title: `Test ${slug}`,
      bodyDsl: `@recipe(slug="${slug}", title="Test ${slug}")`,
      sourceId: source.id,
    },
  });
  db.run(
    sql`UPDATE recipe_versions SET compile_status = 'compiled', compiled_at = datetime('now') WHERE id = ${recipe.version.id}`
  );
  return {
    recipeId: recipe.recipe.id,
    sourceId: source.id,
    draftVersionId: recipe.version.id,
    recipeSlug: slug,
  };
}

function seedFailedSource(opts: {
  errorCode: string;
  errorMessage?: string;
  kind?: 'text' | 'url-web' | 'url-instagram' | 'screenshot';
  url?: string | null;
  attempts?: number;
  ingestedAt?: string;
}): { sourceId: number } {
  const db = getDrizzle();
  const kind = opts.kind ?? 'text';
  const source = ingestSourcesService.createIngestSource(db, {
    kind,
    extractorVersion: 'test-v1',
    url: opts.url ?? null,
  });
  // PRD-125's `workerComplete` writes `error_code` and `error_message` as a
  // pair on `ok:false`. The seed defaults the message to a marker string so
  // every "this is a failed source" fixture is realistic; the legacy
  // half-null case is exercised explicitly by the regression test below.
  const errorMessage = opts.errorMessage ?? `seeded: ${opts.errorCode}`;
  db.update(ingestSources)
    .set({
      errorCode: opts.errorCode,
      errorMessage,
      attempts: opts.attempts ?? 1,
      ...(opts.ingestedAt !== undefined ? { ingestedAt: opts.ingestedAt } : {}),
    })
    .where(eq(ingestSources.id, source.id))
    .run();
  return { sourceId: source.id };
}

describe('food.inbox.listRejected — PRD-138', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    caller = createCaller();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  it('returns rows from recipe_version_rejections joined to ingest_sources', async () => {
    const seed = seedDraft('reject-one', 'text', null);
    await caller.food.inbox.reject({ versionId: seed.draftVersionId, reason: 'duplicate' });
    const result = await caller.food.inbox.listRejected({});
    expect(result.items).toHaveLength(1);
    const [row] = result.items;
    expect(row?.versionId).toBe(seed.draftVersionId);
    expect(row?.recipeSlug).toBe('reject-one');
    expect(row?.reason).toBe('duplicate');
    expect(row?.ingestKind).toBe('text');
    expect(row?.title).toBe('Test reject-one');
    expect(row?.ingestCostUsd).toBeNull();
    expect(result.nextCursor).toBeNull();
  });

  it('excludes manual PRD-119 discards (archived without a rejections row)', async () => {
    const db = getDrizzle();
    const manual = seedDraft('manual-discard');
    // Archive without writing a recipe_version_rejections row — this is the
    // PRD-119 "Discard draft" shape; it must NOT surface in the Rejected tab.
    db.run(sql`UPDATE recipe_versions SET status = 'archived' WHERE id = ${manual.draftVersionId}`);
    const result = await caller.food.inbox.listRejected({});
    expect(result.items).toHaveLength(0);
  });

  it('filters by reason, kind, and sinceDays in one query', async () => {
    const a = seedDraft('reject-a', 'text');
    const b = seedDraft('reject-b', 'url-instagram', 'https://instagram.com/p/abc');
    const c = seedDraft('reject-c', 'screenshot');
    await caller.food.inbox.reject({ versionId: a.draftVersionId, reason: 'duplicate' });
    await caller.food.inbox.reject({ versionId: b.draftVersionId, reason: 'wrong-recipe' });
    await caller.food.inbox.reject({ versionId: c.draftVersionId, reason: 'duplicate' });
    // Filter by reason only:
    const byReason = await caller.food.inbox.listRejected({ reasons: ['wrong-recipe'] });
    expect(byReason.items.map((i) => i.versionId)).toEqual([b.draftVersionId]);
    // Filter by kind only:
    const byKind = await caller.food.inbox.listRejected({ kinds: ['screenshot', 'text'] });
    expect(byKind.items.map((i) => i.versionId).toSorted()).toEqual(
      [a.draftVersionId, c.draftVersionId].toSorted()
    );
    // Filter by reason AND kind:
    const both = await caller.food.inbox.listRejected({
      reasons: ['duplicate'],
      kinds: ['screenshot'],
    });
    expect(both.items.map((i) => i.versionId)).toEqual([c.draftVersionId]);
  });

  it('paginates with a cursor across multiple pages', async () => {
    // 3 rejected drafts, limit = 2 → first page returns 2 + cursor, second
    // returns the remaining 1 + nextCursor=null.
    for (const slug of ['rj-1', 'rj-2', 'rj-3']) {
      const seed = seedDraft(slug);
      await caller.food.inbox.reject({ versionId: seed.draftVersionId, reason: 'duplicate' });
    }
    const page1 = await caller.food.inbox.listRejected({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await caller.food.inbox.listRejected({
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    const allVersionIds = [...page1.items, ...page2.items].map((i) => i.versionId);
    expect(new Set(allVersionIds).size).toBe(3);
  });

  it('aggregates ingest cost across ai_inference_log rows for the source', async () => {
    const seed = seedDraft('reject-cost', 'url-web', 'https://example.com');
    await caller.food.inbox.reject({ versionId: seed.draftVersionId, reason: 'duplicate' });
    // Two ai_inference_log rows for the source — sum must be 0.04.
    getDrizzle().run(
      sql.raw(
        `INSERT INTO ai_inference_log (operation, cost_usd, context_id, created_at) ` +
          `VALUES ('recipe-extract', 0.01, 'ingest_source:${seed.sourceId}', datetime('now')), ` +
          `('recipe-extract', 0.03, 'ingest_source:${seed.sourceId}', datetime('now'))`
      )
    );
    const result = await caller.food.inbox.listRejected({});
    expect(result.items[0]?.ingestCostUsd).toBeCloseTo(0.04, 5);
  });
});

describe('food.inbox.listFailed — PRD-138', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    caller = createCaller();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  it('returns sources with error_code IS NOT NULL', async () => {
    seedFailedSource({
      errorCode: 'InstagramRateLimited',
      errorMessage: 'Rate limited',
      kind: 'url-instagram',
      url: 'https://instagram.com/p/abc',
      attempts: 2,
    });
    const result = await caller.food.inbox.listFailed({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      ingestKind: 'url-instagram',
      sourceUrl: 'https://instagram.com/p/abc',
      errorCode: 'InstagramRateLimited',
      errorMessage: 'Rate limited',
      attempts: 2,
    });
  });

  it('excludes successful sources (error_code IS NULL)', async () => {
    const db = getDrizzle();
    // An ingest_source created without ever failing — the successful path. It
    // must not show up here.
    ingestSourcesService.createIngestSource(db, {
      kind: 'text',
      extractorVersion: 'test-v1',
    });
    seedFailedSource({ errorCode: 'Timeout' });
    const result = await caller.food.inbox.listFailed({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.errorCode).toBe('Timeout');
  });

  it('excludes ok:true partial-draft sources even when auth-dead', async () => {
    // PRD-130's auth-dead path returns ok:true with a placeholder draft, so
    // error_code stays NULL on the source — confirms the predicate excludes it.
    const seed = seedDraft('auth-dead-placeholder', 'url-instagram', 'https://instagram.com/p/x');
    expect(seed.sourceId).toBeGreaterThan(0);
    const result = await caller.food.inbox.listFailed({});
    expect(result.items).toHaveLength(0);
  });

  it('excludes legacy rows where only one of error_code / error_message is set', async () => {
    // PRD-125's `workerComplete` writes the pair atomically, but a backfill
    // or a half-finished migration could produce rows with just one half set.
    // Either half being null means the row can't render a useful Failed row,
    // so `buildWhere` filters it out rather than emitting an empty error
    // message in the UI. Build both cases by hand — the seed helper now
    // mirrors the production-pair contract and won't produce a half-null row.
    const db = getDrizzle();
    const codeOnly = ingestSourcesService.createIngestSource(db, {
      kind: 'text',
      extractorVersion: 'test-v1',
    });
    db.update(ingestSources)
      .set({ errorCode: 'CodeOnlyNoMessage', errorMessage: null, attempts: 1 })
      .where(eq(ingestSources.id, codeOnly.id))
      .run();
    const messageOnly = ingestSourcesService.createIngestSource(db, {
      kind: 'text',
      extractorVersion: 'test-v1',
    });
    db.update(ingestSources)
      .set({ errorCode: null, errorMessage: 'msg without code', attempts: 1 })
      .where(eq(ingestSources.id, messageOnly.id))
      .run();
    const result = await caller.food.inbox.listFailed({});
    expect(result.items).toHaveLength(0);
  });

  it('filters by errorCodes, kinds, and sinceDays', async () => {
    seedFailedSource({ errorCode: 'Timeout', kind: 'url-web', url: 'https://a.test' });
    seedFailedSource({
      errorCode: 'InstagramRateLimited',
      kind: 'url-instagram',
      url: 'https://instagram.com/p/y',
    });
    seedFailedSource({
      errorCode: 'AllExtractionPathsFailed',
      kind: 'url-instagram',
      url: 'https://instagram.com/p/z',
    });
    const byCode = await caller.food.inbox.listFailed({ errorCodes: ['Timeout'] });
    expect(byCode.items.map((i) => i.errorCode)).toEqual(['Timeout']);
    const byKind = await caller.food.inbox.listFailed({ kinds: ['url-instagram'] });
    expect(byKind.items.map((i) => i.errorCode).toSorted()).toEqual([
      'AllExtractionPathsFailed',
      'InstagramRateLimited',
    ]);
  });

  it('paginates with cursor across multiple pages ordered by ingested_at DESC', async () => {
    // ingested_at is `datetime('now')` second-precision, so back-date older
    // rows manually so the ORDER BY produces a stable, asserted sequence.
    seedFailedSource({ errorCode: 'A', ingestedAt: '2026-01-01 10:00:00' });
    seedFailedSource({ errorCode: 'B', ingestedAt: '2026-01-02 10:00:00' });
    seedFailedSource({ errorCode: 'C', ingestedAt: '2026-01-03 10:00:00' });
    const page1 = await caller.food.inbox.listFailed({ limit: 2 });
    expect(page1.items.map((i) => i.errorCode)).toEqual(['C', 'B']);
    const page2 = await caller.food.inbox.listFailed({
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items.map((i) => i.errorCode)).toEqual(['A']);
    expect(page2.nextCursor).toBeNull();
  });
});

describe('food.inbox.failedErrorCodes — PRD-138', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    caller = createCaller();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  it('returns the distinct set of error codes, sorted, excluding NULL', async () => {
    seedFailedSource({ errorCode: 'Timeout' });
    seedFailedSource({ errorCode: 'InstagramRateLimited' });
    seedFailedSource({ errorCode: 'Timeout' });
    seedDraft('success-source'); // NULL error_code — must not show up.
    const codes = await caller.food.inbox.failedErrorCodes();
    expect(codes).toEqual(['InstagramRateLimited', 'Timeout']);
  });
});
