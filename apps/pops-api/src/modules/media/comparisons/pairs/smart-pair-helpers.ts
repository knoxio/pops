import { getStaleness } from '../staleness.js';

import type { getDb } from '../../../../db.js';
import type { MovieMeta } from './smart-pair-fetch.js';

export interface CandidateMovie {
  id: number;
  title: string;
  posterPath: string | null;
  tmdbId: number;
  posterOverridePath: string | null;
  score: number;
  comparisonCount: number;
  daysSinceLastWatch: number;
  staleness: number;
}

export const SAMPLE_SIZE = 50;

export {
  fetchCooloffPairs,
  fetchExcludedIds,
  fetchMovieMetaMap,
  fetchPairCountMap,
  fetchScoreMap,
  fetchWatchedMovies,
  fetchWatchlistedIds,
  type WatchedMovie,
} from './smart-pair-fetch.js';

/**
 * Pick a dimension by dimensionNeed = maxCompCount / (thisDimCompCount + 1).
 * Uses weighted random sampling proportional to dimensionNeed.
 */
export function pickDimensionByNeed(rawDb: ReturnType<typeof getDb>): number | null {
  const dims = rawDb
    .prepare(
      `SELECT id, (SELECT COALESCE(SUM(comparison_count), 0) FROM media_scores WHERE dimension_id = cd.id) as compCount
       FROM comparison_dimensions cd
       WHERE cd.active = 1`
    )
    .all() as Array<{ id: number; compCount: number }>;

  if (dims.length === 0) return null;
  const maxCompCount = Math.max(...dims.map((d) => d.compCount), 1);
  const needs = dims.map((d) => ({
    id: d.id,
    need: maxCompCount / (d.compCount + 1),
  }));
  const totalNeed = needs.reduce((sum, d) => sum + d.need, 0);
  let r = Math.random() * totalNeed;
  for (const d of needs) {
    r -= d.need;
    if (r <= 0) return d.id;
  }
  return needs.at(-1)?.id ?? null;
}

export function shuffleAndTake<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = 0; i < n && i < copy.length; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    const tmp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = tmp as T;
  }
  return copy.slice(0, n);
}

export interface BuildCandidatesArgs {
  movieIds: number[];
  metaMap: Map<number, MovieMeta>;
  watchDateMap: Map<number, string>;
  scoreMap: Map<number, { score: number; comparisonCount: number }>;
}

export function buildCandidates(args: BuildCandidatesArgs): CandidateMovie[] {
  const { movieIds, metaMap, watchDateMap, scoreMap } = args;
  const candidates: CandidateMovie[] = [];
  for (const movieId of movieIds) {
    const meta = metaMap.get(movieId);
    if (!meta) continue;
    const lastWatch = watchDateMap.get(movieId);
    const daysSince = lastWatch
      ? Math.max(0, (Date.now() - new Date(lastWatch).getTime()) / (1000 * 60 * 60 * 24))
      : 365;
    const scoreInfo = scoreMap.get(movieId);
    candidates.push({
      id: movieId,
      title: meta.title,
      posterPath: meta.posterPath,
      tmdbId: meta.tmdbId,
      posterOverridePath: meta.posterOverridePath,
      score: scoreInfo?.score ?? 1500,
      comparisonCount: scoreInfo?.comparisonCount ?? 0,
      daysSinceLastWatch: daysSince,
      staleness: getStaleness('movie', movieId),
    });
  }
  return candidates;
}
