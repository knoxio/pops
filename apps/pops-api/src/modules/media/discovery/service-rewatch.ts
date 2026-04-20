import { and, eq, sql } from 'drizzle-orm';

import { mediaScores, movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

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

function fetchRewatchCandidates(): RewatchRow[] {
  const db = getDrizzle();
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
 * Get rewatch suggestions: movies watched 6+ months ago with above-median
 * ELO score (or top 50% by voteAverage if no ELO data).
 * Sorted by score descending, limited to 20.
 */
export function getRewatchSuggestions(): RewatchSuggestion[] {
  const rows = fetchRewatchCandidates();
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
