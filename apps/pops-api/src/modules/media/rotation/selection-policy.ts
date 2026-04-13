/**
 * Selection policy — weighted random sampling from the candidate queue.
 *
 * Implements PRD-071 US-05: aggregateCandidates(count) picks movies using
 * source_priority × (rating / 10) weighting, with deduplication and
 * exclusion filtering.
 *
 * PRD-071 US-05
 */
import { movies, rotationCandidates, rotationExclusions, rotationSources } from '@pops/db-types';
import { eq } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core selection
// ---------------------------------------------------------------------------

/**
 * Select `count` candidates using weighted random sampling.
 *
 * Weight formula: source_priority × (rating / 10). Null rating → priority × 0.5.
 * Deduplication: if multiple sources contribute the same tmdb_id, max priority wins.
 * Excludes: movies already in the library, movies in rotation_exclusions.
 */
export function aggregateCandidates(count: number): SelectedCandidate[] {
  if (count <= 0) return [];

  const db = getDrizzle();

  // 1. Get all pending candidates with their source priority
  const pendingCandidates = db
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

  if (pendingCandidates.length === 0) return [];

  // 2. Get source priorities
  const sources = db
    .select({ id: rotationSources.id, priority: rotationSources.priority })
    .from(rotationSources)
    .all();
  const sourcePriorityMap = new Map(sources.map((s) => [s.id, s.priority]));

  // 3. Get exclusion set
  const exclusions = db
    .select({ tmdbId: rotationExclusions.tmdbId })
    .from(rotationExclusions)
    .all();
  const excludedTmdbIds = new Set(exclusions.map((e) => e.tmdbId));

  // 4. Get library tmdb IDs to exclude already-owned movies
  const libraryMovies = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
  const libraryTmdbIds = new Set(libraryMovies.map((m) => m.tmdbId));

  // 5. Deduplicate by tmdb_id (max priority wins)
  const deduped = new Map<
    number,
    {
      candidateId: number;
      tmdbId: number;
      title: string;
      year: number | null;
      rating: number | null;
      posterPath: string | null;
      sourcePriority: number;
    }
  >();

  for (const c of pendingCandidates) {
    // Filter exclusions and library
    if (excludedTmdbIds.has(c.tmdbId)) continue;
    if (libraryTmdbIds.has(c.tmdbId)) continue;

    const priority = sourcePriorityMap.get(c.sourceId) ?? 5;
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

  // 6. Compute weights
  const weighted = Array.from(deduped.values()).map((c) => ({
    ...c,
    weight: c.sourcePriority * (c.rating != null ? c.rating / 10 : 0.5),
  }));

  if (weighted.length === 0) return [];

  // 7. Weighted random sampling without replacement
  return weightedSample(weighted, Math.min(count, weighted.length));
}

// ---------------------------------------------------------------------------
// Weighted sampling
// ---------------------------------------------------------------------------

/**
 * Weighted random sampling without replacement using the
 * "selection-rejection" approach: pick proportional to weight,
 * remove selected, repeat.
 */
export function weightedSample<T extends { weight: number }>(items: T[], count: number): T[] {
  const pool = [...items];
  const selected: T[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
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
