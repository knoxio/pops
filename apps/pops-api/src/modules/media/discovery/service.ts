/**
 * Discovery service — computes preference profile from watch history,
 * comparison scores, and genre data.
 */
import {
  comparisonDimensions,
  comparisons,
  dismissedDiscover,
  mediaScores,
  mediaWatchlist,
  movies,
  watchHistory,
} from '@pops/db-types';
import { and, count, desc, eq, notInArray, sql } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import type {
  DimensionWeight,
  DiscoverResult,
  GenreAffinity,
  GenreDistribution,
  PreferenceProfile,
  QuickPickMovie,
  RewatchSuggestion,
  ScoredDiscoverResult,
} from './types.js';
import { TMDB_GENRE_MAP } from './types.js';

/**
 * Compute genre affinity scores by averaging Elo scores for movies
 * in each genre, weighted by comparison count.
 *
 * Uses json_each() (SQLite table-valued function) which has no native
 * Drizzle equivalent — expressed via sql template literals.
 */
function getGenreAffinities(): GenreAffinity[] {
  const db = getDrizzle();

  return db
    .select({
      genre: sql<string>`g.value`,
      avgScore: sql<number>`ROUND(AVG(${mediaScores.score}), 1)`,
      movieCount: sql<number>`COUNT(DISTINCT ${movies.id})`,
      totalComparisons: sql<number>`COALESCE(SUM(${mediaScores.comparisonCount}), 0)`,
    })
    .from(movies)
    .innerJoin(sql`json_each(${movies.genres}) g`, sql`1=1`)
    .innerJoin(
      mediaScores,
      and(eq(mediaScores.mediaType, 'movie'), eq(mediaScores.mediaId, movies.id))
    )
    .groupBy(sql`g.value`)
    .orderBy(desc(sql`ROUND(AVG(${mediaScores.score}), 1)`))
    .all() as GenreAffinity[];
}

/**
 * Compute dimension weights from comparison frequency and average scores.
 */
function getDimensionWeights(): DimensionWeight[] {
  const db = getDrizzle();
  const compCountExpr = sql<number>`COALESCE(SUM(${mediaScores.comparisonCount}), 0)`;

  return db
    .select({
      dimensionId: comparisonDimensions.id,
      name: comparisonDimensions.name,
      comparisonCount: compCountExpr,
      avgScore: sql<number>`ROUND(AVG(${mediaScores.score}), 1)`,
    })
    .from(comparisonDimensions)
    .leftJoin(mediaScores, eq(mediaScores.dimensionId, comparisonDimensions.id))
    .where(eq(comparisonDimensions.active, 1))
    .groupBy(comparisonDimensions.id, comparisonDimensions.name)
    .orderBy(desc(compCountExpr))
    .all() as DimensionWeight[];
}

/**
 * Compute genre distribution from watch history — how often each genre
 * appears across watched movies.
 *
 * Uses json_each() (SQLite table-valued function) via sql template literals.
 */
function getGenreDistribution(): { genres: GenreDistribution[]; totalWatched: number } {
  const db = getDrizzle();

  const [totalResult] = db
    .select({ cnt: sql<number>`COUNT(DISTINCT ${watchHistory.mediaId})` })
    .from(watchHistory)
    .where(eq(watchHistory.mediaType, 'movie'))
    .all();

  const totalWatched = totalResult?.cnt ?? 0;

  if (totalWatched === 0) {
    return { genres: [], totalWatched: 0 };
  }

  const rows = db
    .select({
      genre: sql<string>`g.value`,
      watchCount: sql<number>`COUNT(DISTINCT ${watchHistory.mediaId})`,
    })
    .from(watchHistory)
    .innerJoin(
      movies,
      and(eq(movies.id, watchHistory.mediaId), eq(watchHistory.mediaType, 'movie'))
    )
    .innerJoin(sql`json_each(${movies.genres}) g`, sql`1=1`)
    .groupBy(sql`g.value`)
    .orderBy(desc(sql`COUNT(DISTINCT ${watchHistory.mediaId})`))
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
  const db = getDrizzle();

  const [result] = db.select({ cnt: count() }).from(comparisons).all();

  return result?.cnt ?? 0;
}

/**
 * Get random unwatched movies from the library for quick pick.
 * Excludes movies already on the watchlist or already watched.
 */
export function getQuickPickMovies(count_: number): QuickPickMovie[] {
  const db = getDrizzle();

  const watchedIds = db
    .selectDistinct({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(eq(watchHistory.mediaType, 'movie'));

  const watchlistIds = db
    .select({ mediaId: mediaWatchlist.mediaId })
    .from(mediaWatchlist)
    .where(eq(mediaWatchlist.mediaType, 'movie'));

  const rows = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      releaseDate: movies.releaseDate,
      posterPath: movies.posterPath,
      backdropPath: movies.backdropPath,
      overview: movies.overview,
      voteAverage: movies.voteAverage,
      genres: movies.genres,
      runtime: movies.runtime,
    })
    .from(movies)
    .where(and(notInArray(movies.id, watchedIds), notInArray(movies.id, watchlistIds)))
    .orderBy(sql`RANDOM()`)
    .limit(count_)
    .all();

  return rows.map((row) => ({
    ...row,
    genres: row.genres ?? '[]',
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

/** Reverse map: genre name → TMDB genre ID. */
const GENRE_NAME_TO_ID = Object.fromEntries(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
);

/**
 * Get unwatched library movies mapped to DiscoverResult[] for scoring.
 * Local-only — no external API calls.
 */
export function getUnwatchedLibraryMovies(): DiscoverResult[] {
  const db = getDrizzle();

  const watchedIds = db
    .selectDistinct({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(eq(watchHistory.mediaType, 'movie'));

  const rows = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      releaseDate: movies.releaseDate,
      posterPath: movies.posterPath,
      backdropPath: movies.backdropPath,
      overview: movies.overview,
      voteAverage: movies.voteAverage,
      voteCount: movies.voteCount,
      genres: movies.genres,
    })
    .from(movies)
    .where(notInArray(movies.id, watchedIds))
    .all();

  return rows.map((row) => {
    let genreNames: string[] = [];
    try {
      genreNames = row.genres ? (JSON.parse(row.genres) as string[]) : [];
    } catch {
      // Malformed JSON — skip genres for this movie
    }
    const genreIds = genreNames
      .map((name) => GENRE_NAME_TO_ID[name])
      .filter((id): id is number => id != null);

    return {
      tmdbId: row.tmdbId,
      title: row.title,
      overview: row.overview ?? '',
      releaseDate: row.releaseDate ?? '',
      posterPath: row.posterPath,
      posterUrl: row.posterPath ? `/media/images/movie/${row.tmdbId}/poster.jpg` : null,
      backdropPath: row.backdropPath,
      voteAverage: row.voteAverage ?? 0,
      voteCount: row.voteCount ?? 0,
      genreIds,
      popularity: 0,
      inLibrary: true,
      isWatched: false,
      onWatchlist: false,
    };
  });
}

/**
 * Score recommendation results against the user's preference profile.
 *
 * For each result, maps TMDB genre IDs to genre names, looks up the user's
 * genre affinity scores, and computes a weighted match percentage.
 * Results are sorted by matchPercentage descending.
 */
export function scoreDiscoverResults(
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
        return { ...result, matchPercentage: 0, matchReason: '' };
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
      const matchReason = topGenres.length > 0 ? topGenres.join(', ') : '';

      return { ...result, matchPercentage, matchReason };
    })
    .sort((a, b) => b.matchPercentage - a.matchPercentage);
}

/** Dismiss a movie by tmdbId (idempotent — ON CONFLICT DO NOTHING). */
export function dismiss(tmdbId: number): void {
  const db = getDrizzle();
  db.insert(dismissedDiscover).values({ tmdbId }).onConflictDoNothing().run();
}

/** Undismiss a movie by tmdbId. */
export function undismiss(tmdbId: number): void {
  const db = getDrizzle();
  db.delete(dismissedDiscover).where(eq(dismissedDiscover.tmdbId, tmdbId)).run();
}

/** Get all dismissed tmdbIds. */
export function getDismissed(): number[] {
  const db = getDrizzle();
  const rows = db.select({ tmdbId: dismissedDiscover.tmdbId }).from(dismissedDiscover).all();
  return rows.map((r) => r.tmdbId);
}

/**
 * Get rewatch suggestions: movies watched 6+ months ago with above-median
 * ELO score (or top 50% by voteAverage if no ELO data).
 * Sorted by score descending, limited to 20.
 */
export function getRewatchSuggestions(): RewatchSuggestion[] {
  const db = getDrizzle();

  const sixMonthsAgo = sql`datetime('now', '-6 months')`;

  // Get movies watched 6+ months ago, with optional ELO scores
  const rows = db
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
    .all() as {
    id: number;
    tmdbId: number;
    title: string;
    releaseDate: string | null;
    posterPath: string | null;
    voteAverage: number | null;
    eloScore: number | null;
  }[];

  if (rows.length === 0) return [];

  // Compute effective score for each movie (ELO if available, else voteAverage)
  const hasElo = rows.some((r) => r.eloScore != null);
  const scored = rows.map((row) => ({
    ...row,
    score: hasElo ? (row.eloScore ?? 0) : (row.voteAverage ?? 0),
  }));

  // Filter to above-median score
  const scores = scored.map((r) => r.score).sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)] ?? 0;
  const filtered = scored.filter((r) => r.score >= median);

  // Sort by score desc, limit 20
  filtered.sort((a, b) => b.score - a.score);
  const limited = filtered.slice(0, 20);

  return limited.map((row) => ({
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
