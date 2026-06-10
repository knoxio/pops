/**
 * PRD-138 part A — integration tests for the inbox list queries.
 *
 *   - `listRejected` — filters by reason / kind / sinceDays; excludes
 *                       PRD-119-discarded archives (no rejections row);
 *                       cursor pagination ordering.
 *   - `listFailed`   — excludes sources whose latest meta is `ok: true`,
 *                       including auth-dead partial drafts (PRD-130).
 *
 * Unreject coverage lives in `inbox-router.test.ts` (PRD-136). This file
 * carries the PRD-138 surface only.
 *
 * In-memory SQLite seeded with the same drizzle migration set the existing
 * food integration tests use; BullMQ is irrelevant here so no queue mocks
 * are needed (the inbox router never touches the queue).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';

const FOOD_MIGRATIONS = [
  // PRD-138's `listRejected` joins to `ai_inference_log` for per-source
  // cost rollup; the table lives in the ai-observability module's migration.
  '0045_ai_inference_log.sql',
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

/* ─── fixtures ─────────────────────────────────────────────────────────── */

interface SourceFixture {
  kind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  url?: string;
  ingestedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  extractedJson?: unknown;
  attempts?: number;
}

function insertSource(db: Database, fx: SourceFixture): number {
  const insert = db.prepare(`
    INSERT INTO ingest_sources (
      kind, url, extractor_version, extracted_json,
      ingested_at, error_code, error_message, attempts
    ) VALUES (
      @kind, @url, 'v1', @extracted_json,
      COALESCE(@ingested_at, datetime('now')),
      @error_code, @error_message, COALESCE(@attempts, 0)
    )
  `);
  const result = insert.run({
    kind: fx.kind,
    url: fx.url ?? null,
    extracted_json: fx.extractedJson === undefined ? null : JSON.stringify(fx.extractedJson),
    ingested_at: fx.ingestedAt ?? null,
    error_code: fx.errorCode ?? null,
    error_message: fx.errorMessage ?? null,
    attempts: fx.attempts ?? null,
  });
  return Number(result.lastInsertRowid);
}

interface RejectedFixture {
  slug: string;
  title?: string;
  sourceId: number | null;
  reason: 'wrong-recipe' | 'low-quality-extraction' | 'duplicate' | 'not-a-recipe' | 'other';
  note?: string;
  rejectedAt?: string;
  /** When true, archive the version without writing a rejections row
   *  (simulates PRD-119's discard path). */
  discardOnly?: boolean;
}

function insertRecipeAndRejectedVersion(
  db: Database,
  fx: RejectedFixture
): { recipeId: number; versionId: number } {
  const recipeRes = db
    .prepare(`INSERT INTO recipes (slug, recipe_type) VALUES (?, 'plate')`)
    .run(fx.slug);
  const recipeId = Number(recipeRes.lastInsertRowid);
  db.prepare(`INSERT INTO slug_registry (slug, kind, target_id) VALUES (?, 'recipe', ?)`).run(
    fx.slug,
    recipeId
  );
  const versionRes = db
    .prepare(
      `INSERT INTO recipe_versions (recipe_id, version_no, status, title, body_dsl, source_id)
       VALUES (?, 1, 'archived', ?, '@recipe(slug=' || ? || ', title="t")', ?)`
    )
    .run(recipeId, fx.title ?? 'Test recipe', fx.slug, fx.sourceId);
  const versionId = Number(versionRes.lastInsertRowid);
  if (fx.discardOnly !== true) {
    db.prepare(
      `INSERT INTO recipe_version_rejections (version_id, reason, note, rejected_at)
       VALUES (?, ?, ?, COALESCE(?, datetime('now')))`
    ).run(versionId, fx.reason, fx.note ?? null, fx.rejectedAt ?? null);
  }
  return { recipeId, versionId };
}

function insertAiLog(db: Database, sourceId: number, costUsd: number): void {
  db.prepare(
    `INSERT INTO ai_inference_log
       (provider, model, operation, domain, cost_usd, context_id, status, created_at)
     VALUES ('anthropic','haiku','recipe.extract','food', ?, ?, 'success', datetime('now'))`
  ).run(costUsd, `ingest_source:${sourceId}`);
}

/* ─── setup ────────────────────────────────────────────────────────────── */

let db: Database;

beforeEach(() => {
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  setDb(db);
});

afterEach(() => {
  closeDb();
});

/* ─── listRejected ─────────────────────────────────────────────────────── */

describe('food.inbox.listRejected', () => {
  it('returns the joined row shape ordered newest-first', async () => {
    const oldId = insertSource(db, { kind: 'url-web', url: 'https://a.example/recipe' });
    const newId = insertSource(db, { kind: 'url-instagram', url: 'https://instagram.com/p/b' });
    insertRecipeAndRejectedVersion(db, {
      slug: 'first-recipe',
      title: 'First',
      sourceId: oldId,
      reason: 'wrong-recipe',
      rejectedAt: '2026-06-01T10:00:00.000Z',
    });
    insertRecipeAndRejectedVersion(db, {
      slug: 'second-recipe',
      title: 'Second',
      sourceId: newId,
      reason: 'duplicate',
      note: 'matches existing carbonara',
      rejectedAt: '2026-06-05T10:00:00.000Z',
    });
    insertAiLog(db, oldId, 0.0123);

    const caller = createCaller();
    const result = await caller.food.inbox.listRejected({ sinceDays: null });

    expect(result.items.length).toBe(2);
    expect(result.items[0]?.title).toBe('Second');
    expect(result.items[0]?.recipeSlug).toBe('second-recipe');
    expect(result.items[0]?.reason).toBe('duplicate');
    expect(result.items[0]?.note).toBe('matches existing carbonara');
    expect(result.items[0]?.ingestKind).toBe('url-instagram');
    expect(result.items[0]?.ingestCostUsd).toBeNull();
    expect(result.items[1]?.title).toBe('First');
    expect(result.items[1]?.ingestCostUsd).toBeCloseTo(0.0123);
  });

  it('excludes PRD-119-discarded versions (no rejections row)', async () => {
    const sId = insertSource(db, { kind: 'text' });
    const dId = insertSource(db, { kind: 'text' });
    insertRecipeAndRejectedVersion(db, {
      slug: 'rejected-via-inbox',
      sourceId: sId,
      reason: 'wrong-recipe',
    });
    insertRecipeAndRejectedVersion(db, {
      slug: 'discarded-via-prd119',
      sourceId: dId,
      reason: 'wrong-recipe',
      discardOnly: true,
    });

    const caller = createCaller();
    const result = await caller.food.inbox.listRejected({ sinceDays: null });
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.recipeSlug).toBe('rejected-via-inbox');
  });

  it('filters by reason / kind / sinceDays', async () => {
    const recentSrc = insertSource(db, { kind: 'url-instagram' });
    const oldSrc = insertSource(db, { kind: 'text' });
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    insertRecipeAndRejectedVersion(db, {
      slug: 'recent-instagram',
      sourceId: recentSrc,
      reason: 'duplicate',
    });
    insertRecipeAndRejectedVersion(db, {
      slug: 'old-text',
      sourceId: oldSrc,
      reason: 'not-a-recipe',
      rejectedAt: sixtyDaysAgo,
    });

    const caller = createCaller();

    const byReason = await caller.food.inbox.listRejected({
      reasons: ['duplicate'],
      sinceDays: null,
    });
    expect(byReason.items.map((i) => i.recipeSlug)).toEqual(['recent-instagram']);

    const byKind = await caller.food.inbox.listRejected({
      kinds: ['text'],
      sinceDays: null,
    });
    expect(byKind.items.map((i) => i.recipeSlug)).toEqual(['old-text']);

    const recent30 = await caller.food.inbox.listRejected({ sinceDays: 30 });
    expect(recent30.items.map((i) => i.recipeSlug)).toEqual(['recent-instagram']);
  });

  it('paginates with an opaque cursor', async () => {
    for (let i = 0; i < 3; i++) {
      const srcId = insertSource(db, { kind: 'text' });
      insertRecipeAndRejectedVersion(db, {
        slug: `r${i}`,
        sourceId: srcId,
        reason: 'other',
        note: 'n',
        // Strictly increasing timestamp; reverse order in results.
        rejectedAt: `2026-06-0${i + 1}T10:00:00.000Z`,
      });
    }
    const caller = createCaller();
    const page1 = await caller.food.inbox.listRejected({ sinceDays: null, limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.items.map((i) => i.recipeSlug)).toEqual(['r2', 'r1']);
    expect(page1.nextCursor).toBeTypeOf('string');
    const page2 = await caller.food.inbox.listRejected({
      sinceDays: null,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.map((i) => i.recipeSlug)).toEqual(['r0']);
    expect(page2.nextCursor).toBeUndefined();
  });
});

/* ─── listFailed ───────────────────────────────────────────────────────── */

describe('food.inbox.listFailed', () => {
  it('returns only sources with a non-null error_code', async () => {
    const failedId = insertSource(db, {
      kind: 'url-instagram',
      url: 'https://instagram.com/p/x',
      errorCode: 'InstagramRateLimited',
      errorMessage: 'IG returned 429',
      attempts: 1,
    });
    insertSource(db, { kind: 'text' });

    const caller = createCaller();
    const result = await caller.food.inbox.listFailed({ sinceDays: null });
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.sourceId).toBe(failedId);
    expect(result.items[0]?.errorCode).toBe('InstagramRateLimited');
    expect(result.items[0]?.errorMessage).toBe('IG returned 429');
    expect(result.items[0]?.attempts).toBe(1);
  });

  it('excludes auth-dead partial drafts (they remain in Drafts tab)', async () => {
    // PRD-130 path: ok=true + partialReason='auth-dead' → no error_code,
    // so this source must NOT show up under the Failed tab.
    insertSource(db, {
      kind: 'url-instagram',
      url: 'https://instagram.com/p/auth-dead',
      extractedJson: {
        extractor_version: 'v1',
        stages: {},
        partialReason: 'auth-dead',
      },
    });
    const caller = createCaller();
    const result = await caller.food.inbox.listFailed({ sinceDays: null });
    expect(result.items.length).toBe(0);
  });

  it('filters by errorCodes / kinds and supports the Other bucket', async () => {
    insertSource(db, {
      kind: 'url-instagram',
      errorCode: 'InstagramRateLimited',
      errorMessage: 'IG 429',
    });
    insertSource(db, {
      kind: 'url-web',
      errorCode: 'AllExtractionPathsFailed',
      errorMessage: 'nothing parsed',
    });
    insertSource(db, {
      kind: 'screenshot',
      errorCode: 'MysteryNewCode',
      errorMessage: 'never seen this before',
    });

    const caller = createCaller();
    const igOnly = await caller.food.inbox.listFailed({
      errorCodes: ['InstagramRateLimited'],
      sinceDays: null,
    });
    expect(igOnly.items.map((i) => i.errorCode)).toEqual(['InstagramRateLimited']);

    const webOnly = await caller.food.inbox.listFailed({ kinds: ['url-web'], sinceDays: null });
    expect(webOnly.items.map((i) => i.errorCode)).toEqual(['AllExtractionPathsFailed']);

    // Unknown code passed through verbatim — UI's "Other" bucket is a
    // display concern; the server matches literally.
    const mystery = await caller.food.inbox.listFailed({
      errorCodes: ['MysteryNewCode'],
      sinceDays: null,
    });
    expect(mystery.items.map((i) => i.errorCode)).toEqual(['MysteryNewCode']);
  });
});
