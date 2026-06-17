/**
 * Rotation exclusion-list queries against the media pillar's SQLite.
 *
 * HTTP-free; `(db, …)`-arg. Ported from the monolith
 * `rotation-exclusions-router.ts`. Excluding a movie also flips any matching
 * candidate to `excluded`; un-excluding resets it to `pending`.
 *
 * The exclusions table requires a `title`, but the data-plane `addExclusion`
 * wire input only carries `{ tmdbId, reason? }`. The title is resolved from an
 * existing candidate or library row, falling back to the tmdbId string so the
 * NOT NULL constraint always holds.
 */
import { count, desc, eq } from 'drizzle-orm';

import { movies, rotationCandidates, rotationExclusions } from '../../schema.js';

import type { MediaDb } from '../internal.js';

export type RotationExclusionRow = typeof rotationExclusions.$inferSelect;

export interface AddExclusionInput {
  tmdbId: number;
  reason?: string | null;
}

export interface ListExclusionsInput {
  limit?: number;
  offset?: number;
}

export interface ListExclusionsResult {
  rows: RotationExclusionRow[];
  total: number;
}

/** Resolve a display title for an exclusion from existing candidate/movie rows. */
function resolveTitle(db: MediaDb, tmdbId: number): string {
  const candidate = db
    .select({ title: rotationCandidates.title })
    .from(rotationCandidates)
    .where(eq(rotationCandidates.tmdbId, tmdbId))
    .get();
  if (candidate) return candidate.title;
  const movie = db
    .select({ title: movies.title })
    .from(movies)
    .where(eq(movies.tmdbId, tmdbId))
    .get();
  if (movie) return movie.title;
  return String(tmdbId);
}

/**
 * Exclude a movie from rotation. Inserts an exclusion row (idempotent on the
 * tmdb unique index) and flips any matching candidate to `excluded`.
 */
export function addExclusion(db: MediaDb, input: AddExclusionInput): void {
  const title = resolveTitle(db, input.tmdbId);
  db.transaction((tx) => {
    tx.insert(rotationExclusions)
      .values({ tmdbId: input.tmdbId, title, reason: input.reason ?? null })
      .onConflictDoNothing()
      .run();
    tx.update(rotationCandidates)
      .set({ status: 'excluded' })
      .where(eq(rotationCandidates.tmdbId, input.tmdbId))
      .run();
  });
}

/** List exclusion entries, most-recent first, with pagination. Defaults match the monolith. */
export function listExclusions(db: MediaDb, input: ListExclusionsInput = {}): ListExclusionsResult {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const rows = db
    .select()
    .from(rotationExclusions)
    .orderBy(desc(rotationExclusions.excludedAt))
    .limit(limit)
    .offset(offset)
    .all();
  const totalRow = db.select({ value: count() }).from(rotationExclusions).get();
  return { rows, total: totalRow?.value ?? 0 };
}

/** Fetch an exclusion by tmdbId, or `null` when absent. */
export function getExclusion(db: MediaDb, tmdbId: number): RotationExclusionRow | null {
  return (
    db.select().from(rotationExclusions).where(eq(rotationExclusions.tmdbId, tmdbId)).get() ?? null
  );
}

/**
 * Remove a movie from the exclusion list. Resets any matching candidate to
 * `pending`. Returns true when an exclusion row was actually deleted.
 */
export function removeExclusion(db: MediaDb, tmdbId: number): boolean {
  return db.transaction((tx) => {
    const result = tx.delete(rotationExclusions).where(eq(rotationExclusions.tmdbId, tmdbId)).run();
    if (result.changes > 0) {
      tx.update(rotationCandidates)
        .set({ status: 'pending' })
        .where(eq(rotationCandidates.tmdbId, tmdbId))
        .run();
    }
    return result.changes > 0;
  });
}

/** All tmdbIds currently on the exclusion list (used by source sync). */
export function getExcludedTmdbIds(db: MediaDb): Set<number> {
  return new Set(
    db
      .select({ tmdbId: rotationExclusions.tmdbId })
      .from(rotationExclusions)
      .all()
      .map((r) => r.tmdbId)
  );
}
