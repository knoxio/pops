/**
 * Rewatch suggestions — library movies last watched 6+ months ago with an
 * above-median score (ELO when available, else voteAverage).
 *
 * HTTP-free, `(db, …)` arg. Ported from the monolith `service-rewatch.ts`.
 */
import { and, eq, sql } from 'drizzle-orm';

import { mediaScores, movies, watchHistory } from '../../schema.js';

import type { MediaDb } from '../internal.js';
import type { RewatchSuggestion } from './types.js';

interface RewatchRow {
  id: number;
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  voteAverage: number | null;
  eloScore: number | null;
}

function fetchRewatchCandidates(db: MediaDb): RewatchRow[] {
  const sixMonthsAgo = sql`datetime('now', '-6 months')`;
  return db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      releaseDate: movies.releaseDate,
      posterPath: movies.posterPath,
      voteAverage: movies.voteAverage,
      eloScore: sql<number | null>`MAX(${mediaScores.score})`,
    })
    .from(watchHistory)
    .innerJoin(
      movies,
      and(eq(movies.id, watchHistory.mediaId), eq(watchHistory.mediaType, 'movie'))
    )
    .leftJoin(
      mediaScores,
      and(eq(mediaScores.mediaType, 'movie'), eq(mediaScores.mediaId, movies.id))
    )
    .groupBy(movies.id)
    .having(sql`MAX(${watchHistory.watchedAt}) <= ${sixMonthsAgo}`)
    .all() as RewatchRow[];
}

/**
 * Movies watched 6+ months ago with an above-median score. Sorted by score
 * descending, capped at 20. ELO drives ranking when any candidate has a
 * score; otherwise voteAverage is the fallback signal.
 */
export function getRewatchSuggestions(db: MediaDb): RewatchSuggestion[] {
  const rows = fetchRewatchCandidates(db);
  if (rows.length === 0) return [];

  const hasElo = rows.some((r) => r.eloScore != null);
  const scored = rows.map((row) => ({
    ...row,
    score: hasElo ? (row.eloScore ?? 0) : (row.voteAverage ?? 0),
  }));

  const scores = scored.map((r) => r.score).toSorted((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)] ?? 0;
  const filtered = scored.filter((r) => r.score >= median);
  filtered.sort((a, b) => b.score - a.score);

  return filtered.slice(0, 20).map((row) => ({
    id: row.id,
    tmdbId: row.tmdbId,
    title: row.title,
    releaseDate: row.releaseDate,
    posterPath: row.posterPath,
    posterUrl: row.posterPath ? `/media/images/movie/${row.tmdbId}/poster.jpg` : null,
    voteAverage: row.voteAverage,
    eloScore: row.eloScore,
    score: row.score,
    inLibrary: true as const,
  }));
}
