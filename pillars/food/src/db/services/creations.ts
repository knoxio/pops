/**
 * `listCreationsForVersion` returns the ingredient, variant, and recipe
 * slugs that were registered as part of this version's compile.
 *
 * Sourcing strategy — the **timestamp-window join** (the non-denormalised
 * option) so no schema migration is needed:
 *
 *   1. Read the version's `compiled_at`.
 *   2. Read every `slug_registry` row whose `created_at` falls within a
 *      tight window ending at `compiled_at` (covers ingredients + recipes).
 *   3. Read every `ingredient_variants` row in the same window (variants
 *      are NOT in `slug_registry`; lookups join `ingredient_variants`
 *      via `ingredients.slug → ingredients.id → ingredient_variants`).
 *
 * Timestamp format normalisation. The compile writer stamps
 * `recipe_versions.compiled_at` via `new Date().toISOString()` →
 * `2026-06-10T12:00:00.000Z`. SQLite's `datetime('now')` (used by
 * `slug_registry.created_at` and `ingredient_variants.created_at`) emits
 * `2026-06-10 12:00:00` instead. String-compared, the SQLite shape sorts
 * LESS than the ISO shape because `' '` (0x20) < `'T'` (0x54), so a naive
 * `created_at <= compiled_at` would let rows registered AFTER the compile
 * still satisfy the upper bound. The helper coerces `compiled_at` to the
 * SQLite UTC shape (`YYYY-MM-DD HH:MM:SS`) before constructing either
 * window bound.
 *
 * Why the window is safe enough:
 *   - better-sqlite3 is single-process; compiles never overlap on the same
 *     handle, so the window can't pick up slugs from a concurrent compile.
 *   - The compile transaction registers `slug_registry` + variant rows,
 *     then updates `recipe_versions.compiled_at` — registry timestamps
 *     land strictly before `compiled_at`. The lower bound is a configurable
 *     fudge factor capturing the longest plausible compile transaction
 *     (default 60s — seed compiles are sub-100ms).
 *   - Uncompiled versions (`compiled_at IS NULL`) return zero — the
 *     `CREATIONS_HIGH` quality signal only fires on count > 5 so this
 *     under-attribution is harmless until the recipe compiles cleanly.
 *
 * Limitations the caller should know:
 *   - Two compiles within the same 60s window over-count (each one sees
 *     the other's creations). Seed runs serially; user-driven compiles are
 *     one-at-a-time in single-user POPS.
 *   - Rows deregistered by a later compile still count while present.
 *     Slugs are never deleted once registered, so this is monotonic.
 */
import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';

import { ingredientVariants, recipeVersions, slugRegistry } from '../schema.js';
import { type FoodDb } from './internal.js';

export interface CreationRow {
  slug: string;
  kind: 'ingredient' | 'variant' | 'recipe';
  createdAt: string;
}

/** Default look-back window in seconds. Generous w.r.t. typical compile time. */
export const DEFAULT_CREATION_WINDOW_SECONDS = 60;

export interface ListCreationsOptions {
  /** Override the default 60s window for tests or one-off audits. */
  windowSeconds?: number;
}

export function listCreationsForVersion(
  db: FoodDb,
  versionId: number,
  options: ListCreationsOptions = {}
): readonly CreationRow[] {
  const compiledAt = readCompiledAt(db, versionId);
  if (compiledAt === null) return [];
  const window = buildWindow(compiledAt, options);
  if (window === null) return [];
  return [...readRegistryCreations(db, window), ...readVariantCreations(db, window)];
}

/** Convenience: returns the number of creations in the window. */
export function countCreationsForVersion(
  db: FoodDb,
  versionId: number,
  options: ListCreationsOptions = {}
): number {
  return listCreationsForVersion(db, versionId, options).length;
}

/**
 * Batched creation counter for the inbox queue. Returns a Map keyed by
 * versionId — versions whose `compiled_at` is null are absent (counted as
 * 0 by callers). Single round-trip per source table (`slug_registry`,
 * `ingredient_variants`), regardless of the input cardinality, avoiding
 * the per-row N+1 that a loop-and-count approach would create.
 */
export function countCreationsForVersions(
  db: FoodDb,
  versionIds: readonly number[],
  options: ListCreationsOptions = {}
): Map<number, number> {
  const out = new Map<number, number>();
  if (versionIds.length === 0) return out;

  const windowSeconds = options.windowSeconds ?? DEFAULT_CREATION_WINDOW_SECONDS;
  const versions = db
    .select({ id: recipeVersions.id, compiledAt: recipeVersions.compiledAt })
    .from(recipeVersions)
    .where(inArray(recipeVersions.id, [...versionIds]))
    .all();

  for (const v of versions) {
    if (v.compiledAt === null) continue;
    const window = buildWindow(v.compiledAt, { windowSeconds });
    if (window === null) continue;
    out.set(v.id, countRegistryInWindow(db, window) + countVariantsInWindow(db, window));
  }
  return out;
}

interface Window {
  lowerBound: string;
  upperBound: string;
}

function buildWindow(compiledAt: string, options: ListCreationsOptions): Window | null {
  const windowSeconds = options.windowSeconds ?? DEFAULT_CREATION_WINDOW_SECONDS;
  const upperBound = toSqliteUtc(compiledAt);
  if (upperBound === null) return null;
  const lowerBound = subtractSeconds(upperBound, windowSeconds);
  return { lowerBound, upperBound };
}

function readCompiledAt(db: FoodDb, versionId: number): string | null {
  const rows = db
    .select({ compiledAt: recipeVersions.compiledAt })
    .from(recipeVersions)
    .where(eq(recipeVersions.id, versionId))
    .all();
  return rows[0]?.compiledAt ?? null;
}

function readRegistryCreations(db: FoodDb, window: Window): CreationRow[] {
  return db
    .select({
      slug: slugRegistry.slug,
      kind: slugRegistry.kind,
      createdAt: slugRegistry.createdAt,
    })
    .from(slugRegistry)
    .where(
      and(
        gte(slugRegistry.createdAt, window.lowerBound),
        lte(slugRegistry.createdAt, window.upperBound),
        or(eq(slugRegistry.kind, 'ingredient'), eq(slugRegistry.kind, 'recipe'))
      )
    )
    .all()
    .map((r) => ({
      slug: r.slug,
      kind: r.kind as 'ingredient' | 'recipe',
      createdAt: r.createdAt,
    }));
}

function readVariantCreations(db: FoodDb, window: Window): CreationRow[] {
  return db
    .select({
      slug: ingredientVariants.slug,
      createdAt: ingredientVariants.createdAt,
    })
    .from(ingredientVariants)
    .where(
      and(
        gte(ingredientVariants.createdAt, window.lowerBound),
        lte(ingredientVariants.createdAt, window.upperBound)
      )
    )
    .all()
    .map((r) => ({ slug: r.slug, kind: 'variant' as const, createdAt: r.createdAt }));
}

function countRegistryInWindow(db: FoodDb, window: Window): number {
  const rows = db
    .select({ n: sql<number>`count(*)` })
    .from(slugRegistry)
    .where(
      and(
        gte(slugRegistry.createdAt, window.lowerBound),
        lte(slugRegistry.createdAt, window.upperBound),
        or(eq(slugRegistry.kind, 'ingredient'), eq(slugRegistry.kind, 'recipe'))
      )
    )
    .all();
  return rows[0]?.n ?? 0;
}

function countVariantsInWindow(db: FoodDb, window: Window): number {
  const rows = db
    .select({ n: sql<number>`count(*)` })
    .from(ingredientVariants)
    .where(
      and(
        gte(ingredientVariants.createdAt, window.lowerBound),
        lte(ingredientVariants.createdAt, window.upperBound)
      )
    )
    .all();
  return rows[0]?.n ?? 0;
}

/**
 * Normalise either timestamp shape to the SQLite UTC string
 * (`YYYY-MM-DD HH:MM:SS`). `compiled_at` arrives as
 * `2026-06-10T12:00:00.000Z`; `slug_registry.created_at` arrives as
 * `2026-06-10 12:00:00`. Both round-trip through `Date.parse` cleanly.
 * Returns `null` when the input fails to parse — callers treat that as
 * "no window, return empty".
 */
function toSqliteUtc(value: string): string | null {
  const iso = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return formatSqliteUtc(new Date(t));
}

function subtractSeconds(sqliteUtc: string, seconds: number): string {
  // Input already in `YYYY-MM-DD HH:MM:SS` shape (see `toSqliteUtc`).
  const t = Date.parse(sqliteUtc.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return sqliteUtc;
  return formatSqliteUtc(new Date(t - seconds * 1000));
}

function formatSqliteUtc(d: Date): string {
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
