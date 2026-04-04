/**
 * Comparisons service — dimensions, 1v1 comparisons, and Elo scores.
 */
import { eq, and, or, asc, count, desc } from "drizzle-orm";
import { getDb, getDrizzle } from "../../../db.js";
import {
  comparisonDimensions,
  comparisons,
  mediaScores,
  mediaWatchlist,
  watchHistory,
  movies,
} from "@pops/db-types";
import { NotFoundError, ConflictError, ValidationError } from "../../../shared/errors.js";
import {
  calculateConfidence,
  type ComparisonDimensionRow,
  type ComparisonRow,
  type MediaScoreRow,
  type CreateDimensionInput,
  type UpdateDimensionInput,
  type RecordComparisonInput,
  type RandomPair,
  type RankedMediaEntry,
  type BlacklistMovieResult,
} from "./types.js";

// ── Dimensions ──

const DEFAULT_DIMENSIONS = [
  { name: "Cinematography", description: "Visual quality, framing, and camera work", sortOrder: 0 },
  { name: "Entertainment", description: "How engaging and enjoyable to watch", sortOrder: 1 },
  {
    name: "Emotional Impact",
    description: "Depth of feeling and emotional resonance",
    sortOrder: 2,
  },
  { name: "Rewatchability", description: "How well it holds up on repeat viewings", sortOrder: 3 },
  { name: "Soundtrack", description: "Music, score, and sound design quality", sortOrder: 4 },
];

/** Seed default dimensions if none exist. Returns true if seeded. */
export function seedDefaultDimensions(): boolean {
  const db = getDrizzle();
  const existing = db.select({ id: comparisonDimensions.id }).from(comparisonDimensions).get();
  if (existing) return false;

  for (const dim of DEFAULT_DIMENSIONS) {
    db.insert(comparisonDimensions)
      .values({ name: dim.name, description: dim.description, active: 1, sortOrder: dim.sortOrder })
      .run();
  }
  return true;
}

export function listDimensions(): ComparisonDimensionRow[] {
  const db = getDrizzle();
  const rows = db
    .select()
    .from(comparisonDimensions)
    .orderBy(asc(comparisonDimensions.sortOrder))
    .all();
  if (rows.length === 0) {
    seedDefaultDimensions();
    return db
      .select()
      .from(comparisonDimensions)
      .orderBy(asc(comparisonDimensions.sortOrder))
      .all();
  }
  return rows;
}

export function getDimension(id: number): ComparisonDimensionRow {
  const db = getDrizzle();
  const row = db.select().from(comparisonDimensions).where(eq(comparisonDimensions.id, id)).get();
  if (!row) throw new NotFoundError("Dimension", String(id));
  return row;
}

export function createDimension(input: CreateDimensionInput): ComparisonDimensionRow {
  const db = getDrizzle();

  const existing = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.name, input.name))
    .get();
  if (existing) {
    throw new ConflictError(`Dimension '${input.name}' already exists`);
  }

  const result = db
    .insert(comparisonDimensions)
    .values({
      name: input.name,
      description: input.description ?? null,
      active: input.active ? 1 : 0,
      sortOrder: input.sortOrder ?? 0,
      weight: input.weight ?? 1.0,
    })
    .run();

  return getDimension(Number(result.lastInsertRowid));
}

export function updateDimension(id: number, input: UpdateDimensionInput): ComparisonDimensionRow {
  const db = getDrizzle();
  getDimension(id); // verify exists

  const updates: Partial<typeof comparisonDimensions.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description ?? null;
  if (input.active !== undefined) updates.active = input.active ? 1 : 0;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.weight !== undefined) updates.weight = input.weight;

  if (Object.keys(updates).length > 0) {
    db.update(comparisonDimensions).set(updates).where(eq(comparisonDimensions.id, id)).run();
  }

  return getDimension(id);
}

// ── Comparisons ──

/** Elo K-factor for score updates. */
const ELO_K = 32;

/** Map draw tier to ELO outcome value. High = both gain, Mid = neutral, Low = both lose. */
function drawTierOutcome(tier: string | null | undefined): number {
  switch (tier) {
    case "high":
      return 0.7;
    case "low":
      return 0.3;
    default:
      return 0.5;
  }
}

/** Calculate expected score for player A given ratings. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Record a 1v1 comparison and update Elo scores.
 * Validates that the winner matches one of the two media items.
 * Wraps insert + Elo update in a transaction for consistency.
 */
export function recordComparison(input: RecordComparisonInput): ComparisonRow {
  const drizzleDb = getDrizzle();

  // Verify dimension exists and is active
  const dimension = getDimension(input.dimensionId);
  if (dimension.active !== 1) {
    throw new ValidationError("Cannot record comparison for inactive dimension");
  }

  // Validate winner matches one of the two media items, or is a draw (winnerId = 0)
  const isDraw = input.winnerId === 0;
  const winnerIsA =
    !isDraw && input.winnerType === input.mediaAType && input.winnerId === input.mediaAId;
  const winnerIsB =
    !isDraw && input.winnerType === input.mediaBType && input.winnerId === input.mediaBId;

  if (!isDraw && !winnerIsA && !winnerIsB) {
    throw new ValidationError("Winner must match either media A or media B, or be 0 for a draw");
  }

  // Wrap insert + Elo update in a transaction
  const rawDb = getDb();
  const row = rawDb.transaction(() => {
    const result = drizzleDb
      .insert(comparisons)
      .values({
        dimensionId: input.dimensionId,
        mediaAType: input.mediaAType,
        mediaAId: input.mediaAId,
        mediaBType: input.mediaBType,
        mediaBId: input.mediaBId,
        winnerType: input.winnerType,
        winnerId: input.winnerId,
        drawTier: input.drawTier ?? null,
      })
      .run();

    // Update Elo scores
    updateEloScores(input);

    const inserted = drizzleDb
      .select()
      .from(comparisons)
      .where(eq(comparisons.id, Number(result.lastInsertRowid)))
      .get();
    if (!inserted) throw new Error("Failed to retrieve recorded comparison");
    return inserted;
  })();

  return row;
}

function getOrCreateScore(mediaType: string, mediaId: number, dimensionId: number): MediaScoreRow {
  const db = getDrizzle();

  const existing = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.mediaId, mediaId),
        eq(mediaScores.dimensionId, dimensionId)
      )
    )
    .get();

  if (existing) return existing;

  db.insert(mediaScores)
    .values({
      mediaType,
      mediaId,
      dimensionId,
      score: 1500.0,
      comparisonCount: 0,
    })
    .run();

  const score: MediaScoreRow | undefined = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.mediaId, mediaId),
        eq(mediaScores.dimensionId, dimensionId)
      )
    )
    .get();

  if (!score) throw new Error(`Score not found for ${mediaType}:${mediaId}:${dimensionId}`);
  return score;
}

function updateEloScores(input: RecordComparisonInput): void {
  const db = getDrizzle();

  const scoreA = getOrCreateScore(input.mediaAType, input.mediaAId, input.dimensionId);
  const scoreB = getOrCreateScore(input.mediaBType, input.mediaBId, input.dimensionId);

  const expectedA = expectedScore(scoreA.score, scoreB.score);
  const expectedB = expectedScore(scoreB.score, scoreA.score);

  const isDraw = input.winnerId === 0;
  const drawOutcome = isDraw ? drawTierOutcome(input.drawTier) : 0.5;
  const actualA = isDraw
    ? drawOutcome
    : input.winnerType === input.mediaAType && input.winnerId === input.mediaAId
      ? 1
      : 0;
  const actualB = isDraw ? drawOutcome : 1 - actualA;

  const newScoreA = scoreA.score + ELO_K * (actualA - expectedA);
  const newScoreB = scoreB.score + ELO_K * (actualB - expectedB);
  const now = new Date().toISOString();

  db.update(mediaScores)
    .set({
      score: newScoreA,
      comparisonCount: scoreA.comparisonCount + 1,
      updatedAt: now,
    })
    .where(eq(mediaScores.id, scoreA.id))
    .run();

  db.update(mediaScores)
    .set({
      score: newScoreB,
      comparisonCount: scoreB.comparisonCount + 1,
      updatedAt: now,
    })
    .where(eq(mediaScores.id, scoreB.id))
    .run();
}

export interface ComparisonListResult {
  rows: ComparisonRow[];
  total: number;
}

export function listComparisonsForMedia(
  mediaType: string,
  mediaId: number,
  dimensionId: number | undefined,
  limit: number,
  offset: number
): ComparisonListResult {
  const db = getDrizzle();

  const mediaCondition = or(
    and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
    and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
  );

  const conditions = dimensionId
    ? and(mediaCondition, eq(comparisons.dimensionId, dimensionId))
    : mediaCondition;

  const rows = db
    .select()
    .from(comparisons)
    .where(conditions)
    .orderBy(desc(comparisons.comparedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(comparisons).where(conditions).all()[0];
  const total = countRow?.total ?? 0;

  return { rows, total };
}

/**
 * Delete a comparison and recalculate Elo scores for the affected dimension.
 * Replays all remaining comparisons in chronological order to ensure accuracy.
 */
export function deleteComparison(id: number): void {
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  const comparison = drizzleDb.select().from(comparisons).where(eq(comparisons.id, id)).get();
  if (!comparison) throw new NotFoundError("Comparison", String(id));

  const dimensionId = comparison.dimensionId;

  rawDb.transaction(() => {
    // Delete the comparison
    drizzleDb.delete(comparisons).where(eq(comparisons.id, id)).run();

    // Reset all scores for this dimension
    drizzleDb
      .update(mediaScores)
      .set({ score: 1500.0, comparisonCount: 0, updatedAt: new Date().toISOString() })
      .where(eq(mediaScores.dimensionId, dimensionId))
      .run();

    // Replay all remaining comparisons in chronological order
    const remaining = drizzleDb
      .select()
      .from(comparisons)
      .where(eq(comparisons.dimensionId, dimensionId))
      .orderBy(asc(comparisons.comparedAt))
      .all();

    for (const comp of remaining) {
      updateEloScores({
        dimensionId: comp.dimensionId,
        mediaAType: comp.mediaAType as "movie" | "tv_show",
        mediaAId: comp.mediaAId,
        mediaBType: comp.mediaBType as "movie" | "tv_show",
        mediaBId: comp.mediaBId,
        winnerType: comp.winnerType as "movie" | "tv_show",
        winnerId: comp.winnerId,
        drawTier: comp.drawTier as "high" | "mid" | "low" | null,
      });
    }
  })();
}

/**
 * Blacklist a movie: mark all its watch_history rows as blacklisted,
 * delete all comparisons involving it, and recalculate ELO for affected dimensions.
 */
export function blacklistMovie(mediaType: string, mediaId: number): BlacklistMovieResult {
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  return rawDb.transaction(() => {
    // 1. Set blacklisted = 1 on all watch_history rows for this media
    const blacklistResult = rawDb
      .prepare(
        `UPDATE watch_history SET blacklisted = 1
         WHERE media_type = ? AND media_id = ? AND blacklisted = 0`
      )
      .run(mediaType, mediaId);
    const blacklistedCount = blacklistResult.changes;

    // 2. Find all comparisons involving this media (either side)
    const affectedComparisons = drizzleDb
      .select()
      .from(comparisons)
      .where(
        or(
          and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
          and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
        )
      )
      .all();

    const comparisonsDeleted = affectedComparisons.length;

    // 3. Collect affected dimension IDs (unique)
    const affectedDimensionIds = [...new Set(affectedComparisons.map((c) => c.dimensionId))];

    // 4. Delete all comparisons involving this media
    if (comparisonsDeleted > 0) {
      rawDb
        .prepare(
          `DELETE FROM comparisons
           WHERE (media_a_type = ? AND media_a_id = ?)
              OR (media_b_type = ? AND media_b_id = ?)`
        )
        .run(mediaType, mediaId, mediaType, mediaId);
    }

    // 5. Replay ELO for each affected dimension
    for (const dimensionId of affectedDimensionIds) {
      // Reset all scores in this dimension
      drizzleDb
        .update(mediaScores)
        .set({ score: 1500.0, comparisonCount: 0, updatedAt: new Date().toISOString() })
        .where(eq(mediaScores.dimensionId, dimensionId))
        .run();

      // Replay remaining comparisons chronologically
      const remaining = drizzleDb
        .select()
        .from(comparisons)
        .where(eq(comparisons.dimensionId, dimensionId))
        .orderBy(asc(comparisons.comparedAt))
        .all();

      for (const comp of remaining) {
        updateEloScores({
          dimensionId: comp.dimensionId,
          mediaAType: comp.mediaAType as "movie" | "tv_show",
          mediaAId: comp.mediaAId,
          mediaBType: comp.mediaBType as "movie" | "tv_show",
          mediaBId: comp.mediaBId,
          winnerType: comp.winnerType as "movie" | "tv_show",
          winnerId: comp.winnerId,
          drawTier: comp.drawTier as "high" | "mid" | "low" | null,
        });
      }
    }

    return {
      blacklistedCount,
      comparisonsDeleted,
      dimensionsRecalculated: affectedDimensionIds.length,
    };
  })();
}

/**
 * List all comparisons across all dimensions, ordered by most recent first.
 */
export function listAllComparisons(
  dimensionId: number | undefined,
  limit: number,
  offset: number
): ComparisonListResult {
  const db = getDrizzle();

  const conditions = dimensionId ? eq(comparisons.dimensionId, dimensionId) : undefined;

  const rows = db
    .select()
    .from(comparisons)
    .where(conditions)
    .orderBy(desc(comparisons.comparedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = conditions
    ? db.select({ total: count() }).from(comparisons).where(conditions).all()[0]
    : db.select({ total: count() }).from(comparisons).all()[0];
  const total = countRow?.total ?? 0;

  return { rows, total };
}

// ── Random Pair ──

/**
 * Get a random pair of watched movies for comparison, avoiding recently
 * compared pairs for the given dimension.
 *
 * @param dimensionId - The dimension to compare on
 * @param avoidRecent - Number of recent comparisons to check for repeat avoidance (default 10)
 * @returns A pair of movies with metadata, or null if fewer than 2 watched movies exist
 */
export function getRandomPair(dimensionId: number, avoidRecent: number = 50): RandomPair | null {
  getDimension(dimensionId); // verify dimension exists

  const db = getDrizzle();

  // Get distinct watched movie IDs
  const allWatchedIds = db
    .select({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(and(eq(watchHistory.mediaType, "movie"), eq(watchHistory.completed, 1)))
    .groupBy(watchHistory.mediaId)
    .all()
    .map((r) => r.mediaId);

  // Exclude movies on the watchlist (user queued them for rewatch, skip in arena)
  const watchlistedIds = new Set(
    db
      .select({ mediaId: mediaWatchlist.mediaId })
      .from(mediaWatchlist)
      .where(eq(mediaWatchlist.mediaType, "movie"))
      .all()
      .map((r) => r.mediaId)
  );

  const watchedMovieIds = allWatchedIds.filter((id) => !watchlistedIds.has(id));

  if (watchedMovieIds.length < 2) return null;

  // Get recent comparison pairs for this dimension to avoid
  const recentPairs: Set<string> = new Set();
  if (avoidRecent > 0) {
    const recent = db
      .select({
        mediaAId: comparisons.mediaAId,
        mediaBId: comparisons.mediaBId,
      })
      .from(comparisons)
      .where(
        and(
          eq(comparisons.dimensionId, dimensionId),
          eq(comparisons.mediaAType, "movie"),
          eq(comparisons.mediaBType, "movie")
        )
      )
      .orderBy(desc(comparisons.comparedAt))
      .limit(avoidRecent)
      .all();

    for (const r of recent) {
      // Store both orderings so we can check either direction
      recentPairs.add(`${r.mediaAId}-${r.mediaBId}`);
      recentPairs.add(`${r.mediaBId}-${r.mediaAId}`);
    }
  }

  // Try to find a non-recent pair (with bounded attempts)
  const maxAttempts = Math.min(watchedMovieIds.length * 3, 100);
  let movieAId: number | null = null;
  let movieBId: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const idxA = Math.floor(Math.random() * watchedMovieIds.length);
    let idxB = Math.floor(Math.random() * (watchedMovieIds.length - 1));
    if (idxB >= idxA) idxB++;

    const candidateA = watchedMovieIds[idxA];
    const candidateB = watchedMovieIds[idxB];

    if (!recentPairs.has(`${candidateA}-${candidateB}`)) {
      movieAId = candidateA ?? null;
      movieBId = candidateB ?? null;
      break;
    }
  }

  // Fallback: if all pairs are recent, just pick any random pair
  if (movieAId === null || movieBId === null) {
    const idxA = Math.floor(Math.random() * watchedMovieIds.length);
    let idxB = Math.floor(Math.random() * (watchedMovieIds.length - 1));
    if (idxB >= idxA) idxB++;
    movieAId = watchedMovieIds[idxA] ?? null;
    movieBId = watchedMovieIds[idxB] ?? null;
  }

  // Fetch movie metadata
  if (movieAId === null || movieBId === null) return null;

  const movieARow = db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, movieAId))
    .get();

  const movieBRow = db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, movieBId))
    .get();

  if (!movieARow || !movieBRow) return null;

  const resolveMoviePoster = (row: {
    posterPath: string | null;
    tmdbId: number;
    posterOverridePath: string | null;
  }): string | null => {
    if (row.posterOverridePath) return row.posterOverridePath;
    if (row.posterPath) return `/media/images/movie/${row.tmdbId}/poster.jpg`;
    return null;
  };

  return {
    movieA: {
      id: movieARow.id,
      title: movieARow.title,
      posterPath: movieARow.posterPath,
      posterUrl: resolveMoviePoster(movieARow),
    },
    movieB: {
      id: movieBRow.id,
      title: movieBRow.title,
      posterPath: movieBRow.posterPath,
      posterUrl: resolveMoviePoster(movieBRow),
    },
  };
}

// ── Scores ──

export function getScoresForMedia(
  mediaType: string,
  mediaId: number,
  dimensionId?: number
): MediaScoreRow[] {
  const db = getDrizzle();

  const conditions = [eq(mediaScores.mediaType, mediaType), eq(mediaScores.mediaId, mediaId)];
  if (dimensionId) {
    conditions.push(eq(mediaScores.dimensionId, dimensionId));
  }

  return db
    .select()
    .from(mediaScores)
    .where(and(...conditions))
    .orderBy(desc(mediaScores.score))
    .all();
}

// ── Rankings ──

export interface RankingsResult {
  rows: RankedMediaEntry[];
  total: number;
}

/**
 * Get ranked list of media items by Elo score.
 *
 * - With dimensionId: returns scores for that specific dimension.
 * - Without dimensionId (Overall): computes average score across all active
 *   dimensions for each media item.
 *
 * Ordering: scored items first (by score DESC, title ASC for tie-breaking),
 * then unscored items (zero comparisons) sorted alphabetically by title.
 *
 * Supports optional mediaType filter and pagination.
 */
/** Resolve the best poster URL from a rankings row. */
function resolvePosterUrl(row: {
  mediaType: string;
  moviePosterPath: string | null;
  movieTmdbId: number | null;
  moviePosterOverride: string | null;
  tvPosterPath: string | null;
  tvTvdbId: number | null;
  tvPosterOverride: string | null;
}): string | null {
  if (row.mediaType === "movie") {
    if (row.moviePosterOverride) return row.moviePosterOverride;
    if (row.moviePosterPath && row.movieTmdbId)
      return `/media/images/movie/${row.movieTmdbId}/poster.jpg`;
    return null;
  }
  if (row.tvPosterOverride) return row.tvPosterOverride;
  if (row.tvPosterPath && row.tvTvdbId) return `/media/images/tv/${row.tvTvdbId}/poster.jpg`;
  return null;
}

export function getRankings(
  dimensionId: number | undefined,
  mediaType: string | undefined,
  limit: number,
  offset: number
): RankingsResult {
  const rawDb = getDb();

  if (dimensionId) {
    // Per-dimension ranking — JOIN movies/tv_shows for title tie-breaking
    const mediaTypeClause = mediaType ? "AND ms.media_type = ?" : "";
    const params: unknown[] = [dimensionId];
    if (mediaType) params.push(mediaType);

    const countResult = rawDb
      .prepare(
        `SELECT COUNT(*) as total FROM media_scores ms
         WHERE ms.dimension_id = ? ${mediaTypeClause}`
      )
      .get(...params) as { total: number };

    const rows = rawDb
      .prepare(
        `SELECT
          ms.media_type as mediaType,
          ms.media_id as mediaId,
          ms.score as score,
          ms.comparison_count as comparisonCount,
          COALESCE(m.title, tv.name, 'Unknown') as title,
          CASE
            WHEN ms.media_type = 'movie' THEN CAST(SUBSTR(m.release_date, 1, 4) AS INTEGER)
            ELSE CAST(SUBSTR(tv.first_air_date, 1, 4) AS INTEGER)
          END as year,
          m.poster_path as moviePosterPath,
          m.tmdb_id as movieTmdbId,
          m.poster_override_path as moviePosterOverride,
          tv.poster_path as tvPosterPath,
          tv.tvdb_id as tvTvdbId,
          tv.poster_override_path as tvPosterOverride
        FROM media_scores ms
        LEFT JOIN movies m ON ms.media_type = 'movie' AND ms.media_id = m.id
        LEFT JOIN tv_shows tv ON ms.media_type = 'tv_show' AND ms.media_id = tv.id
        WHERE ms.dimension_id = ? ${mediaTypeClause}
        ORDER BY
          CASE WHEN ms.comparison_count = 0 THEN 1 ELSE 0 END,
          ms.score DESC,
          COALESCE(m.title, tv.name) ASC
        LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<{
      mediaType: string;
      mediaId: number;
      score: number;
      comparisonCount: number;
      title: string;
      year: number | null;
      moviePosterPath: string | null;
      movieTmdbId: number | null;
      moviePosterOverride: string | null;
      tvPosterPath: string | null;
      tvTvdbId: number | null;
      tvPosterOverride: string | null;
    }>;

    return {
      rows: rows.map((row, i) => ({
        rank: offset + i + 1,
        mediaType: row.mediaType,
        mediaId: row.mediaId,
        title: row.title,
        year: row.year,
        posterUrl: resolvePosterUrl(row),
        score: Math.round(row.score * 10) / 10,
        comparisonCount: row.comparisonCount,
        confidence: calculateConfidence(row.comparisonCount),
      })),
      total: countResult.total,
    };
  }

  // Overall ranking — average score across all active dimensions
  const drizzleDb = getDrizzle();
  const activeDimensionIds = drizzleDb
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all()
    .map((r) => r.id);

  if (activeDimensionIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const dimensionPlaceholders = activeDimensionIds.map(() => "?").join(",");
  const baseParams: unknown[] = [...activeDimensionIds];

  const mediaTypeClause = mediaType ? "AND ms.media_type = ?" : "";
  const filterParams: unknown[] = mediaType ? [...baseParams, mediaType] : [...baseParams];

  const countResult = rawDb
    .prepare(
      `SELECT COUNT(*) as total FROM (
        SELECT ms.media_type, ms.media_id
        FROM media_scores ms
        JOIN comparison_dimensions cd ON ms.dimension_id = cd.id
        WHERE cd.active = 1 AND ms.dimension_id IN (${dimensionPlaceholders}) ${mediaTypeClause}
        GROUP BY ms.media_type, ms.media_id
      )`
    )
    .get(...filterParams) as { total: number };

  const rows = rawDb
    .prepare(
      `SELECT
        ms.media_type as mediaType,
        ms.media_id as mediaId,
        SUM(ms.score * cd.weight) / SUM(cd.weight) as score,
        SUM(ms.comparison_count) as comparisonCount,
        MIN(ms.comparison_count) as minComparisonCount,
        COALESCE(m.title, tv.name, 'Unknown') as title,
        CASE
          WHEN ms.media_type = 'movie' THEN CAST(SUBSTR(m.release_date, 1, 4) AS INTEGER)
          ELSE CAST(SUBSTR(tv.first_air_date, 1, 4) AS INTEGER)
        END as year,
        m.poster_path as moviePosterPath,
        m.tmdb_id as movieTmdbId,
        m.poster_override_path as moviePosterOverride,
        tv.poster_path as tvPosterPath,
        tv.tvdb_id as tvTvdbId,
        tv.poster_override_path as tvPosterOverride
      FROM media_scores ms
      JOIN comparison_dimensions cd ON ms.dimension_id = cd.id
      LEFT JOIN movies m ON ms.media_type = 'movie' AND ms.media_id = m.id
      LEFT JOIN tv_shows tv ON ms.media_type = 'tv_show' AND ms.media_id = tv.id
      WHERE cd.active = 1 AND ms.dimension_id IN (${dimensionPlaceholders}) ${mediaTypeClause}
      GROUP BY ms.media_type, ms.media_id
      ORDER BY
        CASE WHEN SUM(ms.comparison_count) = 0 THEN 1 ELSE 0 END,
        SUM(ms.score * cd.weight) / SUM(cd.weight) DESC,
        COALESCE(m.title, tv.name) ASC
      LIMIT ? OFFSET ?`
    )
    .all(...filterParams, limit, offset) as Array<{
    mediaType: string;
    mediaId: number;
    score: number;
    comparisonCount: number;
    minComparisonCount: number;
    title: string;
    year: number | null;
    moviePosterPath: string | null;
    movieTmdbId: number | null;
    moviePosterOverride: string | null;
    tvPosterPath: string | null;
    tvTvdbId: number | null;
    tvPosterOverride: string | null;
  }>;

  return {
    rows: rows.map((row, i) => ({
      rank: offset + i + 1,
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      title: row.title,
      year: row.year,
      posterUrl: resolvePosterUrl(row),
      score: Math.round(row.score * 10) / 10,
      comparisonCount: row.comparisonCount,
      confidence: calculateConfidence(row.minComparisonCount),
    })),
    total: countResult.total,
  };
}
