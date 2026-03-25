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
  QuickPickMovie,
  DiscoverResult,
  ScoredDiscoverResult,
} from "./types.js";
import { TMDB_GENRE_MAP } from "./types.js";

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
 * Get random unwatched movies from the library for quick pick.
 * Excludes movies already on the watchlist or already watched.
 */
export function getQuickPickMovies(count: number): QuickPickMovie[] {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT m.id, m.tmdb_id AS tmdbId, m.title, m.release_date AS releaseDate,
              m.poster_path AS posterPath, m.backdrop_path AS backdropPath,
              m.overview, m.vote_average AS voteAverage, m.genres, m.runtime
       FROM movies m
       WHERE m.id NOT IN (
         SELECT DISTINCT media_id FROM watch_history WHERE media_type = 'movie'
       )
       AND m.id NOT IN (
         SELECT media_id FROM watchlist WHERE media_type = 'movie'
       )
       ORDER BY RANDOM()
       LIMIT ?`
    )
    .all(count) as Omit<QuickPickMovie, "posterUrl">[];

  return rows.map((row) => ({
    ...row,
    posterUrl: row.posterPath ? `/media/images/movie/${row.tmdbId}/poster.jpg` : null,
  }));
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

/**
 * Score recommendation results against the user's preference profile.
 *
 * For each result, maps TMDB genre IDs to genre names, looks up the user's
 * genre affinity scores, and computes a weighted match percentage.
 * Results are sorted by matchPercentage descending.
 */
export function scoreRecommendations(
  results: DiscoverResult[],
  profile: PreferenceProfile
): ScoredDiscoverResult[] {
  // Build genre name → normalized score (0–1) from affinities
  const affinityMap = new Map<string, number>();
  if (profile.genreAffinities.length > 0) {
    const maxScore = Math.max(...profile.genreAffinities.map((a) => a.avgScore));
    const minScore = Math.min(...profile.genreAffinities.map((a) => a.avgScore));
    const range = maxScore - minScore || 1;
    for (const a of profile.genreAffinities) {
      affinityMap.set(a.genre, (a.avgScore - minScore) / range);
    }
  }

  // Fall back to genre distribution if no comparison data
  if (affinityMap.size === 0 && profile.genreDistribution.length > 0) {
    const maxPct = Math.max(...profile.genreDistribution.map((g) => g.percentage));
    for (const g of profile.genreDistribution) {
      affinityMap.set(g.genre, maxPct > 0 ? g.percentage / maxPct : 0);
    }
  }

  return results
    .map((result) => {
      const genreNames = result.genreIds
        .map((id) => TMDB_GENRE_MAP[id])
        .filter((name): name is string => name != null);

      if (genreNames.length === 0 || affinityMap.size === 0) {
        return { ...result, matchPercentage: 0, matchReason: "" };
      }

      // Average the normalized affinity scores for this movie's genres
      let totalScore = 0;
      const matchedGenres: { name: string; score: number }[] = [];
      for (const genre of genreNames) {
        const score = affinityMap.get(genre) ?? 0;
        totalScore += score;
        if (score > 0) {
          matchedGenres.push({ name: genre, score });
        }
      }

      const avgScore = totalScore / genreNames.length;
      // Scale to 50–98 range for a realistic feel (pure 100% is unlikely)
      const matchPercentage = Math.round(50 + avgScore * 48);

      // Top matching genres for the explanation
      matchedGenres.sort((a, b) => b.score - a.score);
      const topGenres = matchedGenres.slice(0, 3).map((g) => g.name);
      const matchReason = topGenres.length > 0 ? topGenres.join(", ") : "";

      return { ...result, matchPercentage, matchReason };
    })
    .sort((a, b) => b.matchPercentage - a.matchPercentage);
}
