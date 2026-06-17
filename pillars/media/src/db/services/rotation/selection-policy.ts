/**
 * Weighted candidate selection for the rotation addition phase.
 *
 * HTTP-free; `(db, …)`-arg. Ported verbatim from the monolith
 * `rotation/selection-policy.ts`: `aggregateCandidates(count)` picks pending
 * candidates with `source_priority × (rating / 10)` weighting, dedupes by
 * tmdbId (max priority wins), and drops anything already in the library or on
 * the exclusion list. The addition orchestration (slice 11b) consumes this.
 */
import { eq } from 'drizzle-orm';

import { movies, rotationCandidates, rotationExclusions, rotationSources } from '../../schema.js';

import type { MediaDb } from '../internal.js';

export interface SelectedCandidate {
  candidateId: number;
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
  sourcePriority: number;
  weight: number;
}

interface PendingRow {
  candidateId: number;
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
  sourceId: number;
}

interface DedupedCandidate {
  candidateId: number;
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
  sourcePriority: number;
}

const DEFAULT_SOURCE_PRIORITY = 5;
const NULL_RATING_WEIGHT_FACTOR = 0.5;

function fetchPendingCandidates(db: MediaDb): PendingRow[] {
  return db
    .select({
      candidateId: rotationCandidates.id,
      tmdbId: rotationCandidates.tmdbId,
      title: rotationCandidates.title,
      year: rotationCandidates.year,
      rating: rotationCandidates.rating,
      posterPath: rotationCandidates.posterPath,
      sourceId: rotationCandidates.sourceId,
    })
    .from(rotationCandidates)
    .where(eq(rotationCandidates.status, 'pending'))
    .all();
}

function buildSourcePriorityMap(db: MediaDb): Map<number, number> {
  const sources = db
    .select({ id: rotationSources.id, priority: rotationSources.priority })
    .from(rotationSources)
    .all();
  return new Map(sources.map((s) => [s.id, s.priority]));
}

function buildExcludedSets(db: MediaDb): {
  excludedTmdbIds: Set<number>;
  libraryTmdbIds: Set<number>;
} {
  const exclusions = db
    .select({ tmdbId: rotationExclusions.tmdbId })
    .from(rotationExclusions)
    .all();
  const libraryMovies = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
  return {
    excludedTmdbIds: new Set(exclusions.map((e) => e.tmdbId)),
    libraryTmdbIds: new Set(libraryMovies.map((m) => m.tmdbId)),
  };
}

function dedupePendingCandidates(
  pending: PendingRow[],
  sourcePriorityMap: Map<number, number>,
  excludedTmdbIds: Set<number>,
  libraryTmdbIds: Set<number>
): Map<number, DedupedCandidate> {
  const deduped = new Map<number, DedupedCandidate>();
  for (const c of pending) {
    if (excludedTmdbIds.has(c.tmdbId)) continue;
    if (libraryTmdbIds.has(c.tmdbId)) continue;
    const priority = sourcePriorityMap.get(c.sourceId) ?? DEFAULT_SOURCE_PRIORITY;
    const existing = deduped.get(c.tmdbId);
    if (!existing || priority > existing.sourcePriority) {
      deduped.set(c.tmdbId, {
        candidateId: c.candidateId,
        tmdbId: c.tmdbId,
        title: c.title,
        year: c.year,
        rating: c.rating,
        posterPath: c.posterPath,
        sourcePriority: priority,
      });
    }
  }
  return deduped;
}

/**
 * Weighted random sampling without replacement: pick proportional to weight,
 * remove the selected element, repeat until `count` is reached or the pool is
 * exhausted (or its total weight collapses to zero).
 */
export function weightedSample<T extends { weight: number }>(items: T[], count: number): T[] {
  const pool = [...items];
  const selected: T[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sumWeight, item) => sumWeight + item.weight, 0);
    if (totalWeight <= 0) break;

    let r = Math.random() * totalWeight;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      const item = pool[idx];
      if (item) r -= item.weight;
      if (r <= 0) break;
    }

    const chosen = pool[idx];
    if (chosen) selected.push(chosen);
    pool.splice(idx, 1);
  }

  return selected;
}

/**
 * Select up to `count` pending candidates by weighted random sampling. Weight
 * is `source_priority × (rating / 10)`; a null rating uses
 * `source_priority × 0.5`. Returns `[]` for a non-positive count or an empty
 * eligible pool.
 */
export function aggregateCandidates(db: MediaDb, count: number): SelectedCandidate[] {
  if (count <= 0) return [];

  const pending = fetchPendingCandidates(db);
  if (pending.length === 0) return [];

  const sourcePriorityMap = buildSourcePriorityMap(db);
  const { excludedTmdbIds, libraryTmdbIds } = buildExcludedSets(db);
  const deduped = dedupePendingCandidates(
    pending,
    sourcePriorityMap,
    excludedTmdbIds,
    libraryTmdbIds
  );

  const weighted = Array.from(deduped.values()).map((c) => ({
    ...c,
    weight: c.sourcePriority * (c.rating != null ? c.rating / 10 : NULL_RATING_WEIGHT_FACTOR),
  }));
  if (weighted.length === 0) return [];

  return weightedSample(weighted, Math.min(count, weighted.length));
}
