/**
 * Rotation candidate writes used by the source-sync + download orchestration.
 *
 * Split from `candidates.ts` (the queue CRUD surface) so both files stay
 * within the per-file line cap. HTTP-free; `(db, …)`-arg.
 */
import { eq, sql } from 'drizzle-orm';

import { RotationCandidateNotFoundError, RotationCandidateNotPendingError } from '../../errors.js';
import { rotationCandidates, rotationSources } from '../../schema.js';

import type { MediaDb } from '../internal.js';
import type { RotationCandidateRow } from './candidates.js';

/** A candidate as fetched from a source adapter (pre-persistence). */
export interface FetchedCandidate {
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
}

/** Load a candidate by id, asserting it exists and is still pending. */
export function getPendingCandidate(db: MediaDb, candidateId: number): RotationCandidateRow {
  const candidate = db
    .select()
    .from(rotationCandidates)
    .where(eq(rotationCandidates.id, candidateId))
    .get();
  if (!candidate) throw new RotationCandidateNotFoundError(candidateId);
  if (candidate.status !== 'pending') {
    throw new RotationCandidateNotPendingError(candidateId, candidate.status);
  }
  return candidate;
}

/** Mark a candidate as `added` (used after a successful download). */
export function markCandidateAdded(db: MediaDb, candidateId: number): void {
  db.update(rotationCandidates)
    .set({ status: 'added' })
    .where(eq(rotationCandidates.id, candidateId))
    .run();
}

/**
 * Bulk-upsert fetched candidates for a source. Marks each `excluded` when its
 * tmdbId is on the exclusion list, else `pending`. Returns insert/skip counts.
 */
export function upsertFetchedCandidates(
  db: MediaDb,
  sourceId: number,
  candidates: ReadonlyArray<FetchedCandidate>,
  excludedTmdbIds: ReadonlySet<number>
): { inserted: number; skipped: number } {
  let inserted = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const status = excludedTmdbIds.has(candidate.tmdbId) ? 'excluded' : 'pending';
    const result = db
      .insert(rotationCandidates)
      .values({
        sourceId,
        tmdbId: candidate.tmdbId,
        title: candidate.title,
        year: candidate.year,
        rating: candidate.rating,
        posterPath: candidate.posterPath,
        status,
      })
      .onConflictDoNothing()
      .run();
    if (result.changes > 0) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
}

/** Touch a source's `lastSyncedAt` to now (after a sync). */
export function touchSourceSyncedAt(db: MediaDb, sourceId: number): void {
  db.update(rotationSources)
    .set({ lastSyncedAt: sql`datetime('now')` })
    .where(eq(rotationSources.id, sourceId))
    .run();
}
