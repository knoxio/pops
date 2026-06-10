/**
 * PRD-116 amendment (driven by PRD-137 + PRD-135).
 *
 * `listCreationsForVersion` returns the ingredient + recipe slugs that were
 * registered in `slug_registry` as part of this version's compile.
 *
 * **Sourcing strategy** — PRD-137 §"creationCount sourcing" left the
 * implementation choice to PRD-116. We pick the **timestamp-window join**
 * (the non-denormalised option) so no schema migration is needed:
 *
 *   1. Read the version's `compiled_at`.
 *   2. Read every `slug_registry` row whose `created_at` falls within a
 *      tight window ending at `compiled_at`.
 *
 * Why this is safe enough in POPS:
 *   - better-sqlite3 is single-process; compiles never overlap on the same
 *     pillar handle, so the window can't accidentally pick up slugs from a
 *     concurrent compile.
 *   - The compile transaction registers `slug_registry` rows then updates
 *     `recipe_versions.compiled_at` — the registry timestamps therefore
 *     land strictly before (or equal to) `compiled_at`. The window upper
 *     bound is `compiled_at` itself, and the lower bound is a configurable
 *     fudge factor capturing the longest plausible compile transaction
 *     (default 60s — compiles for PRD-113's seed are sub-100ms; 60s
 *     is two orders of magnitude over the observed budget).
 *   - Uncompiled versions (`compiled_at IS NULL`) return zero creations —
 *     PRD-137's `CREATIONS_HIGH` signal only fires on count > 5, so this
 *     under-attribution is harmless until the recipe compiles cleanly.
 *
 * Limitations the caller should know:
 *   - The window matches creations from any compile that landed in the
 *     same wall-clock window. In a single-user system the only way this
 *     trips is if the user kicks off two compiles within 60s and both
 *     produce auto-creations — the heuristic over-counts in that case.
 *   - Slugs deregistered by a later compile are still counted while the
 *     row exists. PRD-106 never deletes slugs once registered, so the
 *     row count is monotonic in practice.
 *
 * If the over-counting ever matters for UX, the fallback in PRD-137 §2
 * (`creation_count` column on `recipe_versions`) is a single-migration
 * follow-up — the function signature here stays stable.
 */
import { and, eq, gte, lte } from 'drizzle-orm';

import { recipeVersions, slugRegistry } from '../schema.js';
import { type FoodDb } from './internal.js';

export interface CreationRow {
  slug: string;
  kind: 'ingredient' | 'recipe';
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

  const windowSeconds = options.windowSeconds ?? DEFAULT_CREATION_WINDOW_SECONDS;
  const lowerBound = subtractSeconds(compiledAt, windowSeconds);

  const rows = db
    .select({
      slug: slugRegistry.slug,
      kind: slugRegistry.kind,
      createdAt: slugRegistry.createdAt,
    })
    .from(slugRegistry)
    .where(and(gte(slugRegistry.createdAt, lowerBound), lte(slugRegistry.createdAt, compiledAt)))
    .all();

  return rows
    .filter((r): r is CreationRow => r.kind === 'ingredient' || r.kind === 'recipe')
    .map((r) => ({ slug: r.slug, kind: r.kind, createdAt: r.createdAt }));
}

/** Convenience: returns the number of creations in the window. */
export function countCreationsForVersion(
  db: FoodDb,
  versionId: number,
  options: ListCreationsOptions = {}
): number {
  return listCreationsForVersion(db, versionId, options).length;
}

function readCompiledAt(db: FoodDb, versionId: number): string | null {
  const rows = db
    .select({ compiledAt: recipeVersions.compiledAt })
    .from(recipeVersions)
    .where(eq(recipeVersions.id, versionId))
    .all();
  const row = rows[0];
  if (row === undefined) return null;
  return row.compiledAt;
}

function subtractSeconds(iso: string, seconds: number): string {
  // SQLite's `datetime('now')` produces ISO-like UTC strings ("YYYY-MM-DD HH:MM:SS").
  // Parsing as a Date treats the space as a separator; we re-format using the
  // same shape to keep comparisons string-compatible with `slug_registry.created_at`.
  const t = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z')).getTime();
  if (!Number.isFinite(t)) return iso;
  const earlier = new Date(t - seconds * 1000);
  return formatSqliteUtc(earlier);
}

function formatSqliteUtc(d: Date): string {
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
