/**
 * Comparisons service — dimensions, 1v1 comparisons, and Elo scores.
 */
import { eq, and, or, asc, count, desc } from "drizzle-orm";
import { getDb, getDrizzle } from "../../../db.js";
import {
  comparisonDimensions,
  comparisons,
  mediaScores,
  watchHistory,
  movies,
} from "@pops/db-types";
import { NotFoundError, ConflictError, ValidationError } from "../../../shared/errors.js";
import type {
  ComparisonDimensionRow,
  ComparisonRow,
  MediaScoreRow,
  CreateDimensionInput,
  UpdateDimensionInput,
  RecordComparisonInput,
  RandomPair,
  RankedMediaEntry,
} from "./types.js";

// ── Dimensions ──

export function listDimensions(): ComparisonDimensionRow[] {
  const db = getDrizzle();
  return db.select().from(comparisonDimensions).orderBy(asc(comparisonDimensions.sortOrder)).all();
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

  if (Object.keys(updates).length > 0) {
    db.update(comparisonDimensions).set(updates).where(eq(comparisonDimensions.id, id)).run();
  }

  return getDimension(id);
}

// ── Comparisons ──

/** Elo K-factor for score updates. */
const ELO_K = 32;

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

  // Verify dimension exists
  getDimension(input.dimensionId);

  // Validate winner matches one of the two media items
  const winnerIsA = input.winnerType === input.mediaAType && input.winnerId === input.mediaAId;
  const winnerIsB = input.winnerType === input.mediaBType && input.winnerId === input.mediaBId;

  if (!winnerIsA && !winnerIsB) {
    throw new ValidationError("Winner must match either media A or media B");
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

  const actualA =
    input.winnerType === input.mediaAType && input.winnerId === input.mediaAId ? 1 : 0;
  const actualB = 1 - actualA;

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

  const [{ total }] = db.select({ total: count() }).from(comparisons).where(conditions).all();

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
export function getRandomPair(dimensionId: number, avoidRecent: number = 10): RandomPair | null {
  getDimension(dimensionId); // verify dimension exists

  const db = getDrizzle();

  // Get distinct watched movie IDs
  const watchedMovieIds = db
    .select({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(and(eq(watchHistory.mediaType, "movie"), eq(watchHistory.completed, 1)))
    .groupBy(watchHistory.mediaId)
    .all()
    .map((r) => r.mediaId);

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
      movieAId = candidateA;
      movieBId = candidateB;
      break;
    }
  }

  // Fallback: if all pairs are recent, just pick any random pair
  if (movieAId === null || movieBId === null) {
    const idxA = Math.floor(Math.random() * watchedMovieIds.length);
    let idxB = Math.floor(Math.random() * (watchedMovieIds.length - 1));
    if (idxB >= idxA) idxB++;
    movieAId = watchedMovieIds[idxA];
    movieBId = watchedMovieIds[idxB];
  }

  // Fetch movie metadata
  const movieA = db
    .select({ id: movies.id, title: movies.title, posterPath: movies.posterPath })
    .from(movies)
    .where(eq(movies.id, movieAId))
    .get();

  const movieB = db
    .select({ id: movies.id, title: movies.title, posterPath: movies.posterPath })
    .from(movies)
    .where(eq(movies.id, movieBId))
    .get();

  if (!movieA || !movieB) return null;

  return { movieA, movieB };
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
 * - With dimensionId: returns scores for that specific dimension, ordered by score DESC.
 * - Without dimensionId (Overall): computes average score across all active dimensions
 *   for each media item, ordered by average score DESC.
 *
 * Supports optional mediaType filter and pagination.
 */
export function getRankings(
  dimensionId: number | undefined,
  mediaType: string | undefined,
  limit: number,
  offset: number
): RankingsResult {
  const db = getDrizzle();

  if (dimensionId) {
    // Per-dimension ranking — query media_scores directly
    const conditions: ReturnType<typeof eq>[] = [eq(mediaScores.dimensionId, dimensionId)];
    if (mediaType) {
      conditions.push(eq(mediaScores.mediaType, mediaType));
    }

    const where = and(...conditions);

    const rows = db
      .select()
      .from(mediaScores)
      .where(where)
      .orderBy(desc(mediaScores.score))
      .limit(limit)
      .offset(offset)
      .all();

    const [{ total }] = db.select({ total: count() }).from(mediaScores).where(where).all();

    return {
      rows: rows.map((row, i) => ({
        rank: offset + i + 1,
        mediaType: row.mediaType,
        mediaId: row.mediaId,
        score: Math.round(row.score * 10) / 10,
        comparisonCount: row.comparisonCount,
      })),
      total,
    };
  }

  // Overall ranking — average score across all active dimensions
  const activeDimensionIds = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all()
    .map((r) => r.id);

  if (activeDimensionIds.length === 0) {
    return { rows: [], total: 0 };
  }

  // Use raw SQL for the grouped aggregate query with parameterized values
  const rawDb = getDb();
  const dimensionPlaceholders = activeDimensionIds.map(() => "?").join(",");
  const baseParams = [...activeDimensionIds];

  const mediaTypeClause = mediaType ? "AND ms.media_type = ?" : "";
  const filterParams = mediaType ? [...baseParams, mediaType] : [...baseParams];

  const countResult = rawDb
    .prepare(
      `SELECT COUNT(*) as total FROM (
        SELECT ms.media_type, ms.media_id
        FROM media_scores ms
        WHERE ms.dimension_id IN (${dimensionPlaceholders}) ${mediaTypeClause}
        GROUP BY ms.media_type, ms.media_id
      )`
    )
    .get(...filterParams) as { total: number };

  const rows = rawDb
    .prepare(
      `SELECT
        ms.media_type as mediaType,
        ms.media_id as mediaId,
        AVG(ms.score) as score,
        SUM(ms.comparison_count) as comparisonCount
      FROM media_scores ms
      WHERE ms.dimension_id IN (${dimensionPlaceholders}) ${mediaTypeClause}
      GROUP BY ms.media_type, ms.media_id
      ORDER BY score DESC
      LIMIT ? OFFSET ?`
    )
    .all(...filterParams, limit, offset) as Array<{
    mediaType: string;
    mediaId: number;
    score: number;
    comparisonCount: number;
  }>;

  return {
    rows: rows.map((row, i) => ({
      rank: offset + i + 1,
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      score: Math.round(row.score * 10) / 10,
      comparisonCount: row.comparisonCount,
    })),
    total: countResult.total,
  };
}
