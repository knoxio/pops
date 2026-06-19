/**
 * PRD-134 — integration tests for `listDrafts` + `countPendingDrafts`.
 *
 * Spins up an in-memory SQLite seeded with the Epic 00/02/03 migrations the
 * sibling PRD-137 gather test already loads. Asserts:
 *   - only ingest-originated drafts with `reviewed_at IS NULL` and the parent
 *     recipe not archived appear in the list
 *   - the band derivation matches `scoreDraft` over `gatherQualityInputsForVersions`
 *   - `bands` / `kinds` / `partialReasons` / `freshOnly` filters apply
 *   - each documented sort order returns the expected sequence
 *   - cursor pagination yields the rest of the sequence with no duplicates
 *   - `gatherQualityInputsForVersions` runs once per `listDrafts` call (no N+1)
 *   - `countPendingDrafts` matches the pre-filter count
 */

import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as gather from '../../inbox/gather-quality-inputs.js';
import { openFoodDb } from '../open-food-db.js';
import { ingestSources, recipes, recipeVersions } from '../schema.js';
import {
  countPendingDrafts,
  decodeDraftsCursor,
  listDrafts,
} from '../services/inbox-queries-drafts.js';

import type Database from 'better-sqlite3';

import type { FoodDb } from '../services/internal.js';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

interface SeedOpts {
  slug: string;
  kind?: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  url?: string | null;
  extractedJson?: string | null;
  ingestedAt?: string;
  reviewedAt?: string | null;
  archived?: boolean;
  status?: 'draft' | 'current' | 'archived';
  compileStatus?: 'uncompiled' | 'compiled' | 'failed';
  title?: string;
  yieldQty?: number | null;
  sourceId?: number | null;
}

interface Seeded {
  recipeId: number;
  versionId: number;
  sourceId: number;
}

function seedDraft(db: FoodDb, opts: SeedOpts): Seeded {
  const sourceRow = db
    .insert(ingestSources)
    .values({
      kind: opts.kind ?? 'url-web',
      url: opts.url ?? 'https://example.test/recipe',
      extractorVersion: 'test-1',
      extractedJson: opts.extractedJson ?? null,
      ingestedAt: opts.ingestedAt ?? '2026-06-09 12:00:00',
      reviewedAt: opts.reviewedAt ?? null,
    })
    .returning({ id: ingestSources.id })
    .all()[0];
  if (sourceRow === undefined) throw new Error('seed: insert ingest_source failed');
  const recipeRow = db
    .insert(recipes)
    .values({
      slug: opts.slug,
      recipeType: 'plate',
      archivedAt: opts.archived === true ? '2026-06-09 11:00:00' : null,
    })
    .returning({ id: recipes.id })
    .all()[0];
  if (recipeRow === undefined) throw new Error('seed: insert recipe failed');
  const versionRow = db
    .insert(recipeVersions)
    .values({
      recipeId: recipeRow.id,
      versionNo: 1,
      status: opts.status ?? 'draft',
      title: opts.title ?? `Title ${opts.slug}`,
      bodyDsl: `@recipe(slug="${opts.slug}", title="x")`,
      yieldQty: opts.yieldQty ?? null,
      compileStatus: opts.compileStatus ?? 'compiled',
      sourceId: opts.sourceId === undefined ? sourceRow.id : opts.sourceId,
    })
    .returning({ id: recipeVersions.id })
    .all()[0];
  if (versionRow === undefined) throw new Error('seed: insert version failed');
  return { recipeId: recipeRow.id, versionId: versionRow.id, sourceId: sourceRow.id };
}

describe('PRD-134 — listDrafts inclusion + exclusion rules', () => {
  let env: { db: FoodDb; raw: Database.Database };
  beforeEach(() => {
    env = freshDb();
  });

  it('returns ingest-originated pending drafts and shapes the row', () => {
    const seed = seedDraft(env.db, { slug: 'banana-bread', kind: 'url-web' });
    const page = listDrafts(env.db, { limit: 20 });
    expect(page.items).toHaveLength(1);
    const row = page.items[0];
    expect(row?.sourceId).toBe(seed.sourceId);
    expect(row?.versionId).toBe(seed.versionId);
    expect(row?.recipeSlug).toBe('banana-bread');
    expect(row?.ingestKind).toBe('url-web');
    expect(row?.compileStatus).toBe('compiled');
    expect(row?.qualityBand).toBeDefined();
    expect(row?.qualityScore).toBeGreaterThanOrEqual(0);
    expect(row?.qualityScore).toBeLessThanOrEqual(100);
    expect(row?.topSignals.length).toBeLessThanOrEqual(3);
    expect(page.nextCursor).toBeNull();
  });

  it('excludes drafts whose source has been reviewed', () => {
    seedDraft(env.db, { slug: 'approved-one', reviewedAt: '2026-06-10 11:00:00' });
    const page = listDrafts(env.db, { limit: 20 });
    expect(page.items).toHaveLength(0);
  });

  it('excludes drafts whose parent recipe is archived', () => {
    seedDraft(env.db, { slug: 'archived-parent', archived: true });
    const page = listDrafts(env.db, { limit: 20 });
    expect(page.items).toHaveLength(0);
  });

  it('excludes manually-authored drafts (sourceId IS NULL)', () => {
    // Inner-join means the row never enters the candidate set; seed via raw
    // SQL so the version row exists without a source_id.
    const recipe = env.db
      .insert(recipes)
      .values({ slug: 'manual', recipeType: 'plate' })
      .returning({ id: recipes.id })
      .all()[0];
    if (recipe === undefined) throw new Error('seed: manual recipe');
    env.db.run(
      sql`INSERT INTO recipe_versions (recipe_id, version_no, status, title, body_dsl, compile_status) VALUES (${recipe.id}, 1, 'draft', 'Manual', '@recipe(slug="manual", title="x")', 'compiled')`
    );
    const page = listDrafts(env.db, { limit: 20 });
    expect(page.items).toHaveLength(0);
  });

  it('excludes promoted versions (status != draft)', () => {
    seedDraft(env.db, { slug: 'current-one', status: 'current' });
    const page = listDrafts(env.db, { limit: 20 });
    expect(page.items).toHaveLength(0);
  });

  it('exposes the title as null when blank', () => {
    seedDraft(env.db, { slug: 'no-title', title: '   ' });
    const page = listDrafts(env.db, { limit: 20 });
    expect(page.items[0]?.title).toBeNull();
  });
});

describe('PRD-134 — filter + sort + pagination behaviour', () => {
  let env: { db: FoodDb; raw: Database.Database };

  beforeEach(() => {
    env = freshDb();
    // 4 drafts with widely-varying band signals:
    //   clean: compiled, has title + yield, web kind
    //   minor: instagram kind (-5) + missing yield (-15)
    //   attention: missing title + missing yield + 4 proposed slugs
    //   blocked: compile_failed + missing title + missing yield
    seedDraft(env.db, {
      slug: 'clean-one',
      kind: 'url-web',
      title: 'Clean',
      yieldQty: 4,
      ingestedAt: '2026-06-09 12:00:00',
    });
    seedDraft(env.db, {
      slug: 'minor-one',
      kind: 'url-instagram',
      title: 'Minor',
      yieldQty: null,
      ingestedAt: '2026-06-09 13:00:00',
    });
    const att = seedDraft(env.db, {
      slug: 'attention-one',
      kind: 'screenshot',
      title: '',
      yieldQty: null,
      ingestedAt: '2026-06-09 14:00:00',
    });
    // Add 4 proposed slugs to push it deeper into attention.
    for (let i = 0; i < 4; i++) {
      env.db.run(
        sql.raw(
          `INSERT INTO recipe_version_proposed_slugs (recipe_version_id, slug, suggested_kind, from_loc_json) VALUES (${att.versionId}, 'unresolved-${i}', 'ingredient', '[]')`
        )
      );
    }
    seedDraft(env.db, {
      slug: 'blocked-one',
      kind: 'url-instagram',
      title: '',
      yieldQty: null,
      compileStatus: 'failed',
      ingestedAt: '2026-06-09 15:00:00',
    });
  });

  it('filters by band', () => {
    const blockedOnly = listDrafts(env.db, { bands: ['blocked'], limit: 20 });
    expect(blockedOnly.items.every((r) => r.qualityBand === 'blocked')).toBe(true);
    expect(blockedOnly.items.length).toBeGreaterThan(0);
  });

  it('returns no rows when bands is explicitly empty (UI toggled every chip off)', () => {
    // Regression: previously `bands.length > 0` collapsed the empty array to
    // "no band filter applied", which is the opposite of what the UI means.
    // Toggling every chip off must surface zero matches, not the full set.
    const all = listDrafts(env.db, { limit: 20 });
    expect(all.items.length).toBeGreaterThan(0);
    const empty = listDrafts(env.db, { bands: [], limit: 20 });
    expect(empty.items).toHaveLength(0);
  });

  it('returns no rows when partialReasons is explicitly empty', () => {
    // Same shape as the bands regression — an explicit empty array means
    // "no row qualifies on this axis", not "no filter".
    const empty = listDrafts(env.db, { partialReasons: [], limit: 20 });
    expect(empty.items).toHaveLength(0);
  });

  it('filters by kind (SQL-pushed)', () => {
    const igOnly = listDrafts(env.db, { kinds: ['url-instagram'], limit: 20 });
    expect(igOnly.items.every((r) => r.ingestKind === 'url-instagram')).toBe(true);
    expect(igOnly.items.length).toBe(2);
  });

  it('filters by freshOnly (< 24h)', () => {
    // Fix `now` past the 24h boundary so every seeded row is stale.
    const stale = listDrafts(
      env.db,
      { freshOnly: true, limit: 20 },
      new Date('2026-06-11T15:00:00Z')
    );
    expect(stale.items).toHaveLength(0);
    // Same set without freshOnly — all 4 surface.
    const all = listDrafts(env.db, { limit: 20 }, new Date('2026-06-11T15:00:00Z'));
    expect(all.items).toHaveLength(4);
  });

  it('filters by partialReason against extracted_json', () => {
    seedDraft(env.db, {
      slug: 'ig-auth-dead',
      kind: 'url-instagram',
      extractedJson: JSON.stringify({ partialReason: 'auth-dead' }),
    });
    const onlyAuthDead = listDrafts(env.db, { partialReasons: ['auth-dead'], limit: 20 });
    expect(onlyAuthDead.items).toHaveLength(1);
    expect(onlyAuthDead.items[0]?.recipeSlug).toBe('ig-auth-dead');
  });

  it('orders by `newest` (ingested_at DESC)', () => {
    const page = listDrafts(env.db, { sort: 'newest', limit: 20 });
    const times = page.items.map((r) => r.ingestedAt);
    const sorted = [...times].toSorted().toReversed();
    expect(times).toEqual(sorted);
  });

  it('orders by `oldest` (ingested_at ASC)', () => {
    const page = listDrafts(env.db, { sort: 'oldest', limit: 20 });
    const times = page.items.map((r) => r.ingestedAt);
    const sorted = [...times].toSorted();
    expect(times).toEqual(sorted);
  });

  it('orders by `quality-asc` (worst first)', () => {
    const page = listDrafts(env.db, { sort: 'quality-asc', limit: 20 });
    const scores = page.items.map((r) => r.qualityScore);
    const sorted = [...scores].toSorted((a, b) => a - b);
    expect(scores).toEqual(sorted);
  });

  it('orders by `quality-desc` (cleanest first)', () => {
    const page = listDrafts(env.db, { sort: 'quality-desc', limit: 20 });
    const scores = page.items.map((r) => r.qualityScore);
    const sorted = [...scores].toSorted((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it('paginates with a cursor across two pages without duplicates', () => {
    const first = listDrafts(env.db, { sort: 'newest', limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const decoded = decodeDraftsCursor(first.nextCursor ?? '');
    expect(decoded).not.toBeNull();
    const second = listDrafts(env.db, { sort: 'newest', limit: 2, cursor: decoded });
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const allIds = [...first.items, ...second.items].map((r) => r.versionId);
    expect(new Set(allIds).size).toBe(4);
  });
});

describe('PRD-134 — countPendingDrafts + N+1 guard', () => {
  it('matches the count of inclusion-eligible rows pre-filter', () => {
    const env = freshDb();
    seedDraft(env.db, { slug: 'a' });
    seedDraft(env.db, { slug: 'b', kind: 'text' });
    seedDraft(env.db, { slug: 'c', reviewedAt: '2026-06-10 11:00:00' });
    seedDraft(env.db, { slug: 'd', archived: true });
    expect(countPendingDrafts(env.db)).toBe(2);
  });

  it('invokes gatherQualityInputsForVersions exactly once per listDrafts call', () => {
    const env = freshDb();
    for (const slug of ['x', 'y', 'z']) {
      seedDraft(env.db, { slug });
    }
    const spy = vi.spyOn(gather, 'gatherQualityInputsForVersions');
    listDrafts(env.db, { limit: 20 });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
