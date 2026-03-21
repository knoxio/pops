/**
 * Discovery service — computes preference profile from watch history,
 * comparison scores, and genre data.
 */
import { getDb } from "../../../db.js";
import type {
  GenreAffinity,
  DimensionWeight,
  GenreDistribution,
  PreferenceProfile,
} from "./types.js";

/**
 * Compute genre affinity scores by averaging Elo scores for movies
 * in each genre, weighted by comparison count.
 */
function getGenreAffinities(): GenreAffinity[] {
  const db = getDb();

  return db
    .prepare(
      `SELECT
        g.value AS genre,
        ROUND(AVG(ms.score), 1) AS avgScore,
        COUNT(DISTINCT m.id) AS movieCount,
        COALESCE(SUM(ms.comparison_count), 0) AS totalComparisons
      FROM movies m
      JOIN json_each(m.genres) g
      JOIN media_scores ms
        ON ms.media_type = 'movie'
        AND ms.media_id = m.id
      GROUP BY g.value
      ORDER BY avgScore DESC`
    )
    .all() as GenreAffinity[];
}

/**
 * Compute dimension weights from comparison frequency and average scores.
 */
function getDimensionWeights(): DimensionWeight[] {
  const db = getDb();

  return db
    .prepare(
      `SELECT
        cd.id AS dimensionId,
        cd.name,
        COALESCE(SUM(ms.comparison_count), 0) AS comparisonCount,
        ROUND(AVG(ms.score), 1) AS avgScore
      FROM comparison_dimensions cd
      LEFT JOIN media_scores ms ON ms.dimension_id = cd.id
      WHERE cd.active = 1
      GROUP BY cd.id, cd.name
      ORDER BY comparisonCount DESC`
    )
    .all() as DimensionWeight[];
}

/**
 * Compute genre distribution from watch history — how often each genre
 * appears across watched movies.
 */
function getGenreDistribution(): { genres: GenreDistribution[]; totalWatched: number } {
  const db = getDb();

  // Total unique movies watched
  const totalResult = db
    .prepare(
      `SELECT COUNT(DISTINCT media_id) AS cnt
      FROM watch_history
      WHERE media_type = 'movie'`
    )
    .get() as { cnt: number };

  const totalWatched = totalResult.cnt;

  if (totalWatched === 0) {
    return { genres: [], totalWatched: 0 };
  }

  const rows = db
    .prepare(
      `SELECT
        g.value AS genre,
        COUNT(DISTINCT wh.media_id) AS watchCount
      FROM watch_history wh
      JOIN movies m ON m.id = wh.media_id AND wh.media_type = 'movie'
      JOIN json_each(m.genres) g
      GROUP BY g.value
      ORDER BY watchCount DESC`
    )
    .all() as { genre: string; watchCount: number }[];

  const genres: GenreDistribution[] = rows.map((row) => ({
    genre: row.genre,
    watchCount: row.watchCount,
    percentage: Math.round((row.watchCount / totalWatched) * 100),
  }));

  return { genres, totalWatched };
}

/**
 * Get total comparison count across all dimensions.
 */
function getTotalComparisons(): number {
  const db = getDb();

  const result = db.prepare(`SELECT COUNT(*) AS cnt FROM comparisons`).get() as { cnt: number };

  return result.cnt;
}

/**
 * Compute the full preference profile on demand.
 */
export function getPreferenceProfile(): PreferenceProfile {
  const genreAffinities = getGenreAffinities();
  const dimensionWeights = getDimensionWeights();
  const { genres: genreDistribution, totalWatched } = getGenreDistribution();
  const totalComparisons = getTotalComparisons();

  return {
    genreAffinities,
    dimensionWeights,
    genreDistribution,
    totalMoviesWatched: totalWatched,
    totalComparisons,
  };
}
