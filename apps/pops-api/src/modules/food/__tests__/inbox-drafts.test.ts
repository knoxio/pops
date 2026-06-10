/**
 * PRD-134 — integration tests for `food.inbox.list` + `food.inbox.pendingCount`.
 *
 * Verifies the tRPC surface against an in-memory SQLite seeded with the food
 * migration subset. Mirrors the lower-level service tests in `@pops/app-food-db`
 * but operates at the router boundary so the Zod input schemas + cursor codec
 * are exercised end-to-end.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ingestSourcesService, recipesService } from '@pops/app-food-db';

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
  return db;
}

interface SeedOpts {
  slug: string;
  kind?: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  url?: string | null;
  ingestedAt?: string;
  reviewed?: boolean;
  archived?: boolean;
  title?: string;
  compileStatus?: 'uncompiled' | 'compiled' | 'failed';
}

interface Seeded {
  recipeId: number;
  versionId: number;
  sourceId: number;
}

function seedDraft(opts: SeedOpts): Seeded {
  const db = getDrizzle();
  const kind = opts.kind ?? 'url-web';
  const requiresUrl = kind === 'url-web' || kind === 'url-instagram';
  const source = ingestSourcesService.createIngestSource(db, {
    kind,
    extractorVersion: 'test-v1',
    url: opts.url ?? (requiresUrl ? `https://example.test/${opts.slug}` : null),
  });
  if (opts.ingestedAt !== undefined) {
    db.run(
      sql.raw(
        `UPDATE ingest_sources SET ingested_at = '${opts.ingestedAt}' WHERE id = ${source.id}`
      )
    );
  }
  if (opts.reviewed === true) {
    db.run(sql`UPDATE ingest_sources SET reviewed_at = datetime('now') WHERE id = ${source.id}`);
  }
  const recipe = recipesService.createRecipe(db, {
    slug: opts.slug,
    firstVersion: {
      title: opts.title ?? `Title ${opts.slug}`,
      bodyDsl: `@recipe(slug="${opts.slug}", title="x")`,
      sourceId: source.id,
    },
  });
  const compileStatus = opts.compileStatus ?? 'compiled';
  db.run(
    sql.raw(
      `UPDATE recipe_versions SET compile_status = '${compileStatus}', compiled_at = datetime('now') WHERE id = ${recipe.version.id}`
    )
  );
  if (opts.archived === true) {
    db.run(sql`UPDATE recipes SET archived_at = datetime('now') WHERE id = ${recipe.recipe.id}`);
  }
  return { recipeId: recipe.recipe.id, versionId: recipe.version.id, sourceId: source.id };
}

describe('food.inbox.list — PRD-134', () => {
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

  it('returns pending ingest-originated drafts with the documented row shape', async () => {
    const seed = seedDraft({ slug: 'banana-pancakes' });
    const result = await caller.food.inbox.list({});
    expect(result.items).toHaveLength(1);
    const row = result.items[0];
    expect(row?.versionId).toBe(seed.versionId);
    expect(row?.sourceId).toBe(seed.sourceId);
    expect(row?.recipeSlug).toBe('banana-pancakes');
    expect(row?.qualityBand).toBeDefined();
    expect(row?.qualityScore).toBeGreaterThanOrEqual(0);
    expect(row?.qualityScore).toBeLessThanOrEqual(100);
    expect(row?.topSignals.length).toBeLessThanOrEqual(3);
    expect(result.nextCursor).toBeNull();
  });

  it('excludes reviewed sources from the drafts queue', async () => {
    seedDraft({ slug: 'approved', reviewed: true });
    const result = await caller.food.inbox.list({});
    expect(result.items).toHaveLength(0);
  });

  it('excludes archived parent recipes', async () => {
    seedDraft({ slug: 'archived', archived: true });
    const result = await caller.food.inbox.list({});
    expect(result.items).toHaveLength(0);
  });

  it('applies the kind filter at the SQL layer', async () => {
    seedDraft({ slug: 'a', kind: 'url-web' });
    seedDraft({ slug: 'b', kind: 'text' });
    seedDraft({ slug: 'c', kind: 'url-instagram' });
    const onlyText = await caller.food.inbox.list({ kinds: ['text'] });
    expect(onlyText.items).toHaveLength(1);
    expect(onlyText.items[0]?.ingestKind).toBe('text');
  });

  it('paginates via opaque cursor across multiple pages', async () => {
    for (const slug of ['p1', 'p2', 'p3']) {
      seedDraft({ slug, ingestedAt: `2026-06-09 1${slug.slice(1)}:00:00` });
    }
    const page1 = await caller.food.inbox.list({ limit: 2, sort: 'newest' });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await caller.food.inbox.list({
      limit: 2,
      sort: 'newest',
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    const ids = [...page1.items, ...page2.items].map((r) => r.versionId);
    expect(new Set(ids).size).toBe(3);
  });

  it('rejects bad bands input via Zod', async () => {
    await expect(
      caller.food.inbox.list({
        // @ts-expect-error — wire shape test
        bands: ['unknown'],
      })
    ).rejects.toThrow();
  });
});

describe('food.inbox.pendingCount — PRD-134', () => {
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

  it('counts only pending ingest-originated drafts', async () => {
    seedDraft({ slug: 'pending-1' });
    seedDraft({ slug: 'pending-2' });
    seedDraft({ slug: 'reviewed', reviewed: true });
    seedDraft({ slug: 'archived', archived: true });
    const result = await caller.food.inbox.pendingCount();
    expect(result.count).toBe(2);
  });

  it('returns zero when nothing is pending', async () => {
    const result = await caller.food.inbox.pendingCount();
    expect(result.count).toBe(0);
  });
});
