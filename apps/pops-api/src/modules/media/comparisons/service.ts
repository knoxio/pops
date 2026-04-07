/**
 * Comparisons service — dimensions, 1v1 comparisons, and Elo scores.
 */
import { eq, and, or, asc, count, desc, like, inArray, type SQL } from "drizzle-orm";
import { getDb, getDrizzle } from "../../../db.js";
import {
  comparisonDimensions,
  comparisons,
  comparisonSkipCooloffs,
  debriefResults,
  debriefSessions,
  debriefStatus,
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
  type SmartPairResult,
  type RankedMediaEntry,
  type BlacklistMovieResult,
  type DebriefOpponent,
  type PendingDebrief,
  type TierListMovie,
  type SubmitTierListInput,
  type SubmitTierListResult,
  type ScoreChange,
  type RecordDebriefComparisonInput,
  type BatchComparisonItem,
  type BatchRecordResult,
} from "./types.js";
import { getStaleness } from "./staleness.js";
import { setTierOverride } from "./tier-overrides.js";
import { convertTierPlacements } from "./tier-conversion.js";

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

// ── Source Hierarchy ──

/** Source authority ranking: higher rank = more authoritative. null/historical = 0. */
function sourceRank(source: string | null | undefined): number {
  switch (source) {
    case "arena":
      return 2;
    case "tier_list":
      return 1;
    default:
      return 0;
  }
}

/**
 * Find an existing comparison for the same normalized pair on a dimension.
 * Returns the row if found, undefined otherwise.
 */
function findExistingComparison(
  dimensionId: number,
  mediaAType: string,
  mediaAId: number,
  mediaBType: string,
  mediaBId: number
): ComparisonRow | undefined {
  const drizzleDb = getDrizzle();
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );
  return drizzleDb
    .select()
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        or(
          and(
            eq(comparisons.mediaAType, normAType),
            eq(comparisons.mediaAId, normAId),
            eq(comparisons.mediaBType, normBType),
            eq(comparisons.mediaBId, normBId)
          ),
          and(
            eq(comparisons.mediaAType, normBType),
            eq(comparisons.mediaAId, normBId),
            eq(comparisons.mediaBType, normAType),
            eq(comparisons.mediaBId, normAId)
          )
        )
      )
    )
    .get();
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

  const newSource = input.source ?? "arena";

  // Wrap insert + Elo update in a transaction
  const rawDb = getDb();
  const row = rawDb.transaction(() => {
    // Check for existing comparison on this pair+dimension
    const existing = findExistingComparison(
      input.dimensionId,
      input.mediaAType,
      input.mediaAId,
      input.mediaBType,
      input.mediaBId
    );

    if (existing) {
      if (sourceRank(newSource) >= sourceRank(existing.source)) {
        // Override: delete old row, insert new, then full recalc
        drizzleDb.delete(comparisons).where(eq(comparisons.id, existing.id)).run();

        // Insert without incremental ELO — recalc will rebuild everything
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
            source: newSource,
          })
          .run();

        // Full recalc replays all comparisons and sets correct deltas
        recalcDimensionElo(input.dimensionId);

        const inserted = drizzleDb
          .select()
          .from(comparisons)
          .where(eq(comparisons.id, Number(result.lastInsertRowid)))
          .get();
        if (!inserted) throw new Error("Failed to retrieve recorded comparison");
        return inserted;
      } else {
        // Skip: existing has higher authority
        return existing;
      }
    }

    // No existing — compute Elo deltas incrementally and store on the comparison
    const { deltaA, deltaB } = updateEloScores(input);

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
        source: newSource,
        deltaA,
        deltaB,
      })
      .run();

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

function updateEloScores(input: RecordComparisonInput): { deltaA: number; deltaB: number } {
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
  const deltaA = Math.round(newScoreA - scoreA.score);
  const deltaB = Math.round(newScoreB - scoreB.score);
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

  return { deltaA, deltaB };
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

    // Recalculate ELO for the affected dimension
    recalcDimensionElo(dimensionId);
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

    // 5. Replay ELO for each affected dimension (resets scores + updates stored deltas)
    for (const dimensionId of affectedDimensionIds) {
      recalcDimensionElo(dimensionId);
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
  search: string | undefined,
  limit: number,
  offset: number
): ComparisonListResult {
  const db = getDrizzle();

  const conditions: SQL[] = [];
  if (dimensionId) conditions.push(eq(comparisons.dimensionId, dimensionId));
  if (search) {
    const matchingIds = db
      .select({ id: movies.id })
      .from(movies)
      .where(like(movies.title, `%${search}%`))
      .all()
      .map((r) => r.id);
    if (matchingIds.length === 0) return { rows: [], total: 0 };
    const movieFilter = or(
      inArray(comparisons.mediaAId, matchingIds),
      inArray(comparisons.mediaBId, matchingIds)
    );
    if (movieFilter) conditions.push(movieFilter);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(comparisons)
    .where(where)
    .orderBy(desc(comparisons.comparedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(comparisons).where(where).all()[0];
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

// ── Smart Pair Selection ──

/** Candidate movie with metadata needed for weighted scoring. */
interface CandidateMovie {
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

/** Scored candidate pair. */
interface ScoredPair {
  movieA: CandidateMovie;
  movieB: CandidateMovie;
  priority: number;
}

/**
 * Pick a dimension by dimensionNeed = maxCompCount / (thisDimCompCount + 1).
 * Uses weighted random sampling proportional to dimensionNeed.
 */
function pickDimensionByNeed(rawDb: ReturnType<typeof getDb>): number | null {
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

/**
 * informationGain(A, B) = 1 / (1 + abs(scoreA - scoreB) / 200) × 1 / (pairCount + 1)
 */
function informationGain(scoreA: number, scoreB: number, pairCount: number): number {
  return (1 / (1 + Math.abs(scoreA - scoreB) / 200)) * (1 / (pairCount + 1));
}

/**
 * recencyWeight(movie) = 1 / (1 + daysSinceLastWatch / 180)
 */
function recencyWeight(daysSinceLastWatch: number): number {
  return 1 / (1 + daysSinceLastWatch / 180);
}

/**
 * Weighted random sample from items with weights.
 * Returns the selected item, or null if empty.
 */
function weightedRandomSample<T>(items: Array<{ item: T; weight: number }>): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) {
    const picked = items[Math.floor(Math.random() * items.length)];
    return picked ? picked.item : null;
  }
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  const last = items.at(-1);
  return last ? last.item : null;
}

const SAMPLE_SIZE = 50;

/**
 * Get a smart pair of watched movies for comparison using weighted probabilistic selection.
 *
 * Two-stage selection:
 * 1. Pick dimension by dimensionNeed (weighted random)
 * 2. Within dimension, sample eligible movies, generate candidate pairs, score, weighted random sample
 *
 * @param dimensionId - Optional specific dimension; if omitted, picks by dimensionNeed
 * @returns A pair of movies with metadata, or null if fewer than 2 eligible movies
 */
export function getSmartPair(dimensionId?: number): SmartPairResult | null {
  const rawDb = getDb();
  const db = getDrizzle();

  // Stage 1: pick dimension
  const selectedDimId = dimensionId ?? pickDimensionByNeed(rawDb);
  if (selectedDimId === null) return null;

  // Verify dimension exists
  getDimension(selectedDimId);

  // Get all completed, non-blacklisted watched movie IDs with their most recent watch date
  const watchedMovies = rawDb
    .prepare(
      `SELECT wh.media_id as mediaId,
              MAX(wh.watched_at) as lastWatchedAt
       FROM watch_history wh
       WHERE wh.media_type = 'movie'
         AND wh.completed = 1
         AND wh.blacklisted = 0
       GROUP BY wh.media_id`
    )
    .all() as Array<{ mediaId: number; lastWatchedAt: string }>;

  // Exclude movies on the watchlist
  const watchlistedIds = new Set(
    db
      .select({ mediaId: mediaWatchlist.mediaId })
      .from(mediaWatchlist)
      .where(eq(mediaWatchlist.mediaType, "movie"))
      .all()
      .map((r) => r.mediaId)
  );

  // Exclude movies excluded for this dimension
  const excludedRows = rawDb
    .prepare(
      `SELECT media_id FROM media_scores
       WHERE dimension_id = ? AND media_type = 'movie' AND excluded = 1`
    )
    .all(selectedDimId) as Array<{ media_id: number }>;
  const excludedIds = new Set(excludedRows.map((r) => r.media_id));

  // Get pairs on cooloff for this dimension (skip_until is a global comparison count)
  const globalCount = getGlobalComparisonCount();
  const cooloffPairs = new Set<string>();
  const cooloffRows = rawDb
    .prepare(
      `SELECT media_a_id, media_b_id FROM comparison_skip_cooloffs
       WHERE dimension_id = ? AND media_a_type = 'movie' AND media_b_type = 'movie'
         AND skip_until > ?`
    )
    .all(selectedDimId, globalCount) as Array<{ media_a_id: number; media_b_id: number }>;

  for (const r of cooloffRows) {
    cooloffPairs.add(`${r.media_a_id}-${r.media_b_id}`);
    cooloffPairs.add(`${r.media_b_id}-${r.media_a_id}`);
  }

  // Filter eligible movies (exclude watchlisted and dimension-excluded)
  let eligible = watchedMovies.filter(
    (m) => !watchlistedIds.has(m.mediaId) && !excludedIds.has(m.mediaId)
  );

  // Fallback: if fewer than 2 non-watchlisted movies remain, include watchlisted movies
  // so the arena stays usable when most of the library is on the watchlist
  if (eligible.length < 2) {
    eligible = watchedMovies.filter((m) => !excludedIds.has(m.mediaId));
  }

  if (eligible.length < 2) return null;

  // Sample up to SAMPLE_SIZE movies
  const sampled = eligible.length <= SAMPLE_SIZE ? eligible : shuffleAndTake(eligible, SAMPLE_SIZE);

  // Get scores for sampled movies in this dimension
  const movieIds = sampled.map((m) => m.mediaId);
  const placeholders = movieIds.map(() => "?").join(",");
  const scoreRows = rawDb
    .prepare(
      `SELECT media_id as mediaId, score, comparison_count as comparisonCount
       FROM media_scores
       WHERE dimension_id = ? AND media_type = 'movie' AND media_id IN (${placeholders})`
    )
    .all(selectedDimId, ...movieIds) as Array<{
    mediaId: number;
    score: number;
    comparisonCount: number;
  }>;

  const scoreMap = new Map<number, { score: number; comparisonCount: number }>();
  for (const row of scoreRows) {
    scoreMap.set(row.mediaId, { score: row.score, comparisonCount: row.comparisonCount });
  }

  // Get pair comparison counts for this dimension
  const pairCountRows = rawDb
    .prepare(
      `SELECT media_a_id as mediaAId, media_b_id as mediaBId, COUNT(*) as cnt
       FROM comparisons
       WHERE dimension_id = ? AND media_a_type = 'movie' AND media_b_type = 'movie'
         AND media_a_id IN (${placeholders}) AND media_b_id IN (${placeholders})
       GROUP BY media_a_id, media_b_id`
    )
    .all(selectedDimId, ...movieIds, ...movieIds) as Array<{
    mediaAId: number;
    mediaBId: number;
    cnt: number;
  }>;

  const pairCountMap = new Map<string, number>();
  for (const row of pairCountRows) {
    const key1 = `${row.mediaAId}-${row.mediaBId}`;
    const key2 = `${row.mediaBId}-${row.mediaAId}`;
    const existing = pairCountMap.get(key1) ?? 0;
    pairCountMap.set(key1, existing + row.cnt);
    pairCountMap.set(key2, existing + row.cnt);
  }

  // Build candidate movie objects
  const candidates: CandidateMovie[] = [];
  const movieMetaRows = rawDb
    .prepare(
      `SELECT id, title, poster_path as posterPath, tmdb_id as tmdbId, poster_override_path as posterOverridePath
       FROM movies WHERE id IN (${placeholders})`
    )
    .all(...movieIds) as Array<{
    id: number;
    title: string;
    posterPath: string | null;
    tmdbId: number;
    posterOverridePath: string | null;
  }>;

  const metaMap = new Map(movieMetaRows.map((r) => [r.id, r]));
  const watchDateMap = new Map(sampled.map((m) => [m.mediaId, m.lastWatchedAt]));

  for (const movieId of movieIds) {
    const meta = metaMap.get(movieId);
    if (!meta) continue;

    const lastWatch = watchDateMap.get(movieId);
    const daysSince = lastWatch
      ? Math.max(0, (Date.now() - new Date(lastWatch).getTime()) / (1000 * 60 * 60 * 24))
      : 365; // default to a year if unknown

    const scoreInfo = scoreMap.get(movieId);
    const staleness = getStaleness("movie", movieId);

    candidates.push({
      id: movieId,
      title: meta.title,
      posterPath: meta.posterPath,
      tmdbId: meta.tmdbId,
      posterOverridePath: meta.posterOverridePath,
      score: scoreInfo?.score ?? 1500,
      comparisonCount: scoreInfo?.comparisonCount ?? 0,
      daysSinceLastWatch: daysSince,
      staleness,
    });
  }

  if (candidates.length < 2) return null;

  // Generate candidate pairs and score them
  const scoredPairs: ScoredPair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (!a || !b) continue;

      // Skip pairs on cooloff
      if (cooloffPairs.has(`${a.id}-${b.id}`)) continue;

      const pairKey = `${a.id}-${b.id}`;
      const pairCount = pairCountMap.get(pairKey) ?? 0;

      const infoGain = informationGain(a.score, b.score, pairCount);
      const recA = recencyWeight(a.daysSinceLastWatch);
      const recB = recencyWeight(b.daysSinceLastWatch);
      const staleA = a.staleness;
      const staleB = b.staleness;
      const jitter = 0.7 + Math.random() * 0.6; // [0.7, 1.3]

      const priority = infoGain * recA * recB * staleA * staleB * jitter;
      scoredPairs.push({ movieA: a, movieB: b, priority });
    }
  }

  // Fallback: if no scored pairs (all on cooloff), pick any eligible pair
  if (scoredPairs.length === 0) {
    if (candidates.length >= 2) {
      const a = candidates[0];
      const b = candidates[1];
      if (a && b) return { ...buildRandomPairResult(a, b), dimensionId: selectedDimId };
    }
    return null;
  }

  // Weighted random sample from scored pairs
  const selected = weightedRandomSample(scoredPairs.map((p) => ({ item: p, weight: p.priority })));

  if (!selected) return null;

  return { ...buildRandomPairResult(selected.movieA, selected.movieB), dimensionId: selectedDimId };
}

/** Build the RandomPair result from two CandidateMovie objects. */
function buildRandomPairResult(a: CandidateMovie, b: CandidateMovie): RandomPair {
  const resolveMoviePoster = (candidate: CandidateMovie): string | null => {
    if (candidate.posterOverridePath) return candidate.posterOverridePath;
    if (candidate.posterPath) return `/media/images/movie/${candidate.tmdbId}/poster.jpg`;
    return null;
  };

  return {
    movieA: {
      id: a.id,
      title: a.title,
      posterPath: a.posterPath,
      posterUrl: resolveMoviePoster(a),
    },
    movieB: {
      id: b.id,
      title: b.title,
      posterPath: b.posterPath,
      posterUrl: resolveMoviePoster(b),
    },
  };
}

/** Shuffle array and take first n elements (Fisher-Yates partial shuffle). */
function shuffleAndTake<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = 0; i < n && i < copy.length; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    const tmp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = tmp as T;
  }
  return copy.slice(0, n);
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
export function resolvePosterUrl(row: {
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
         WHERE ms.dimension_id = ? AND ms.excluded = 0 ${mediaTypeClause}`
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
        WHERE ms.dimension_id = ? AND ms.excluded = 0 ${mediaTypeClause}
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
        WHERE cd.active = 1 AND ms.excluded = 0 AND ms.dimension_id IN (${dimensionPlaceholders}) ${mediaTypeClause}
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
      WHERE cd.active = 1 AND ms.excluded = 0 AND ms.dimension_id IN (${dimensionPlaceholders}) ${mediaTypeClause}
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

// ── Dimension Exclusion ──

/**
 * Recalculate ELO scores for a dimension by resetting all scores and replaying
 * all comparisons in chronological order.
 */
function recalcDimensionElo(dimensionId: number): void {
  const drizzleDb = getDrizzle();

  // Reset all scores for this dimension
  drizzleDb
    .update(mediaScores)
    .set({ score: 1500.0, comparisonCount: 0, updatedAt: new Date().toISOString() })
    .where(eq(mediaScores.dimensionId, dimensionId))
    .run();

  // Replay all remaining comparisons in chronological order, updating stored deltas
  const remaining = drizzleDb
    .select()
    .from(comparisons)
    .where(eq(comparisons.dimensionId, dimensionId))
    .orderBy(asc(comparisons.comparedAt))
    .all();

  for (const comp of remaining) {
    const { deltaA, deltaB } = updateEloScores({
      dimensionId: comp.dimensionId,
      mediaAType: comp.mediaAType as "movie" | "tv_show",
      mediaAId: comp.mediaAId,
      mediaBType: comp.mediaBType as "movie" | "tv_show",
      mediaBId: comp.mediaBId,
      winnerType: comp.winnerType as "movie" | "tv_show",
      winnerId: comp.winnerId,
      drawTier: comp.drawTier as "high" | "mid" | "low" | null,
    });

    drizzleDb.update(comparisons).set({ deltaA, deltaB }).where(eq(comparisons.id, comp.id)).run();
  }
}

/**
 * Recalculate ELO scores for all active dimensions.
 * Used after bulk data changes (e.g. dedupe migration).
 */
export function recalcAllDimensions(): number {
  const drizzleDb = getDrizzle();
  const dims = drizzleDb
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();
  for (const dim of dims) {
    recalcDimensionElo(dim.id);
  }
  return dims.length;
}

/**
 * Exclude a media item from a dimension: sets excluded=1 on the media_scores row
 * (creates with score 1500 + excluded=1 if missing), deletes all comparisons
 * involving that item for this dimension, and recalculates ELO.
 */
export function excludeFromDimension(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): { comparisonsDeleted: number } {
  getDimension(dimensionId); // verify exists
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  let comparisonsDeleted = 0;

  rawDb.transaction(() => {
    // Upsert media_scores row with excluded=1
    const existing = drizzleDb
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

    if (existing) {
      drizzleDb
        .update(mediaScores)
        .set({ excluded: 1, updatedAt: new Date().toISOString() })
        .where(eq(mediaScores.id, existing.id))
        .run();
    } else {
      drizzleDb
        .insert(mediaScores)
        .values({
          mediaType,
          mediaId,
          dimensionId,
          score: 1500.0,
          comparisonCount: 0,
          excluded: 1,
        })
        .run();
    }

    // Delete all comparisons involving this media item for this dimension
    const result = drizzleDb
      .delete(comparisons)
      .where(
        and(
          eq(comparisons.dimensionId, dimensionId),
          or(
            and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
            and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
          )
        )
      )
      .run();

    comparisonsDeleted = result.changes;

    // Recalculate ELO for this dimension
    recalcDimensionElo(dimensionId);
  })();

  return { comparisonsDeleted };
}

/**
 * Re-include a media item in a dimension: sets excluded=0.
 */
export function includeInDimension(mediaType: string, mediaId: number, dimensionId: number): void {
  getDimension(dimensionId); // verify exists
  const drizzleDb = getDrizzle();

  const existing = drizzleDb
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

  if (!existing) {
    throw new NotFoundError("MediaScore", `${mediaType}:${mediaId}:${dimensionId}`);
  }

  drizzleDb
    .update(mediaScores)
    .set({ excluded: 0, updatedAt: new Date().toISOString() })
    .where(eq(mediaScores.id, existing.id))
    .run();
}

// ── Skip Cooloff ──

/** Get the total number of comparisons across all dimensions. */
export function getGlobalComparisonCount(): number {
  const db = getDrizzle();
  const result = db.select({ total: count() }).from(comparisons).get();
  return result?.total ?? 0;
}

/**
 * Record a skip cooloff for a pair of media items in a dimension.
 * Sets skip_until = current global comparison count + 10.
 * Upserts if the pair already has a cooloff (extends it).
 */
export function recordSkip(
  dimensionId: number,
  mediaAType: string,
  mediaAId: number,
  mediaBType: string,
  mediaBId: number
): number {
  const db = getDrizzle();
  const globalCount = getGlobalComparisonCount();
  const skipUntil = globalCount + 10;

  // Normalize pair ordering for consistent storage (lower id first)
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );

  // Upsert: insert or update skip_until if pair already exists
  const existing = db
    .select()
    .from(comparisonSkipCooloffs)
    .where(
      and(
        eq(comparisonSkipCooloffs.dimensionId, dimensionId),
        eq(comparisonSkipCooloffs.mediaAType, normAType),
        eq(comparisonSkipCooloffs.mediaAId, normAId),
        eq(comparisonSkipCooloffs.mediaBType, normBType),
        eq(comparisonSkipCooloffs.mediaBId, normBId)
      )
    )
    .get();

  if (existing) {
    db.update(comparisonSkipCooloffs)
      .set({ skipUntil })
      .where(eq(comparisonSkipCooloffs.id, existing.id))
      .run();
  } else {
    db.insert(comparisonSkipCooloffs)
      .values({
        dimensionId,
        mediaAType: normAType,
        mediaAId: normAId,
        mediaBType: normBType,
        mediaBId: normBId,
        skipUntil,
      })
      .run();
  }

  return skipUntil;
}

/**
 * Check if a pair is currently on cooloff for a dimension.
 * Returns true if global comparison count < skip_until.
 * Symmetric: A-vs-B matches B-vs-A.
 */
export function isPairOnCooloff(
  dimensionId: number,
  mediaAType: string,
  mediaAId: number,
  mediaBType: string,
  mediaBId: number
): boolean {
  const db = getDrizzle();
  const globalCount = getGlobalComparisonCount();

  // Normalize pair ordering for consistent lookup
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );

  const cooloff = db
    .select()
    .from(comparisonSkipCooloffs)
    .where(
      and(
        eq(comparisonSkipCooloffs.dimensionId, dimensionId),
        eq(comparisonSkipCooloffs.mediaAType, normAType),
        eq(comparisonSkipCooloffs.mediaAId, normAId),
        eq(comparisonSkipCooloffs.mediaBType, normBType),
        eq(comparisonSkipCooloffs.mediaBId, normBId)
      )
    )
    .get();

  if (!cooloff) return false;
  return globalCount < cooloff.skipUntil;
}

// ── Debrief Opponent Selection ──

/**
 * Select a debrief opponent — the eligible movie closest to the median score
 * for the given dimension.
 *
 * Excludes:
 *  - The debrief movie itself
 *  - Movies excluded from the dimension (excluded = 1)
 *  - Blacklisted movies (watch_history.blacklisted = 1)
 *  - Movies already compared against the debrief movie in this dimension
 */
export function getDebriefOpponent(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): DebriefOpponent | null {
  getDimension(dimensionId); // verify dimension exists

  const db = getDrizzle();

  // Get all non-excluded scores for this dimension
  const allScores = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.dimensionId, dimensionId),
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.excluded, 0)
      )
    )
    .orderBy(asc(mediaScores.score))
    .all();

  // Get blacklisted movie IDs
  const blacklistedIds = new Set(
    db
      .select({ mediaId: watchHistory.mediaId })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.mediaType, mediaType as "movie" | "episode"),
          eq(watchHistory.blacklisted, 1)
        )
      )
      .all()
      .map((r) => r.mediaId)
  );

  // Get IDs of movies already compared against this one in this dimension
  const comparedAgainstIds = new Set<number>();
  const compsA = db
    .select({ mediaBId: comparisons.mediaBId })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        eq(comparisons.mediaAType, mediaType),
        eq(comparisons.mediaAId, mediaId)
      )
    )
    .all();
  for (const c of compsA) comparedAgainstIds.add(c.mediaBId);

  const compsB = db
    .select({ mediaAId: comparisons.mediaAId })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        eq(comparisons.mediaBType, mediaType),
        eq(comparisons.mediaBId, mediaId)
      )
    )
    .all();
  for (const c of compsB) comparedAgainstIds.add(c.mediaAId);

  // Filter eligible candidates
  const eligible = allScores.filter(
    (s) =>
      s.mediaId !== mediaId && !blacklistedIds.has(s.mediaId) && !comparedAgainstIds.has(s.mediaId)
  );

  if (eligible.length === 0) return null;

  // Find median score
  const medianIndex = Math.floor(eligible.length / 2);
  const medianEntry = eligible[medianIndex];
  if (!medianEntry) return null;
  const medianScore = medianEntry.score;

  // Pick the one closest to median
  let closest = eligible[0];
  if (!closest) return null;
  let closestDist = Math.abs(closest.score - medianScore);
  for (const s of eligible) {
    const dist = Math.abs(s.score - medianScore);
    if (dist < closestDist) {
      closest = s;
      closestDist = dist;
    }
  }

  // Fetch movie metadata
  const movieRow = db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, closest.mediaId))
    .get();

  if (!movieRow) return null;

  const posterUrl = movieRow.posterOverridePath
    ? movieRow.posterOverridePath
    : movieRow.posterPath
      ? `/media/images/movie/${movieRow.tmdbId}/poster.jpg`
      : null;

  return {
    id: movieRow.id,
    title: movieRow.title,
    posterPath: movieRow.posterPath,
    posterUrl,
  };
}

// ── Pending Debriefs ──

/**
 * Get all movies with pending or active debrief sessions.
 * Joins debrief_sessions → watch_history → movies and counts
 * how many dimensions still need results per session.
 */
export function getPendingDebriefs(): PendingDebrief[] {
  const db = getDrizzle();

  // Get sessions that are pending or active
  const sessions = db
    .select({
      sessionId: debriefSessions.id,
      status: debriefSessions.status,
      watchHistoryId: debriefSessions.watchHistoryId,
      createdAt: debriefSessions.createdAt,
    })
    .from(debriefSessions)
    .where(or(eq(debriefSessions.status, "pending"), eq(debriefSessions.status, "active")))
    .orderBy(desc(debriefSessions.createdAt))
    .all();

  if (sessions.length === 0) return [];

  // Get count of active dimensions
  const activeDimCount =
    db
      .select({ total: count() })
      .from(comparisonDimensions)
      .where(eq(comparisonDimensions.active, 1))
      .all()[0]?.total ?? 0;

  const results: PendingDebrief[] = [];

  for (const session of sessions) {
    // Get watch history entry to find media info
    const whEntry = db
      .select({
        mediaType: watchHistory.mediaType,
        mediaId: watchHistory.mediaId,
      })
      .from(watchHistory)
      .where(eq(watchHistory.id, session.watchHistoryId))
      .get();

    if (!whEntry || whEntry.mediaType !== "movie") continue;

    // Get movie info
    const movieRow = db
      .select({
        id: movies.id,
        title: movies.title,
        posterPath: movies.posterPath,
        tmdbId: movies.tmdbId,
        posterOverridePath: movies.posterOverridePath,
      })
      .from(movies)
      .where(eq(movies.id, whEntry.mediaId))
      .get();

    if (!movieRow) continue;

    // Count completed debrief results for this session
    const completedCount =
      db
        .select({ total: count() })
        .from(debriefResults)
        .where(eq(debriefResults.sessionId, session.sessionId))
        .all()[0]?.total ?? 0;

    const pendingDimensionCount = Math.max(0, activeDimCount - completedCount);

    const posterUrl = movieRow.posterOverridePath
      ? movieRow.posterOverridePath
      : movieRow.posterPath
        ? `/media/images/movie/${movieRow.tmdbId}/poster.jpg`
        : null;

    results.push({
      sessionId: session.sessionId,
      movieId: movieRow.id,
      title: movieRow.title,
      posterUrl,
      status: session.status as "pending" | "active",
      createdAt: session.createdAt,
      pendingDimensionCount,
    });
  }

  return results;
}

// ── Tier List Movie Selection ──

const MAX_TIER_LIST_MOVIES = 8;
const STALENESS_THRESHOLD = 0.3;

/**
 * Select up to 8 movies for a tier list placement round.
 *
 * Strategy — greedy maximum coverage:
 *  1. Fetch all eligible movies and all existing comparison pairs
 *  2. Greedily pick movies that maximize NEW pairwise comparisons
 *  3. Tie-break by lowest comparison count (highest uncertainty)
 *  - Exclude: blacklisted, excluded-for-dimension, staleness < 0.3
 *  - Returns fewer than 8 if not enough eligible (min 0)
 */
export function getTierListMovies(dimensionId: number): TierListMovie[] {
  getDimension(dimensionId); // verify dimension exists

  const rawDb = getDb();

  // Get eligible movies: non-excluded, with scores, joined to movie metadata
  const rows = rawDb
    .prepare(
      `SELECT
        ms.media_id as mediaId,
        ms.score as score,
        ms.comparison_count as comparisonCount,
        m.title as title,
        m.poster_path as moviePosterPath,
        m.tmdb_id as movieTmdbId,
        m.poster_override_path as moviePosterOverride
      FROM media_scores ms
      JOIN movies m ON ms.media_id = m.id
      LEFT JOIN watch_history wh ON wh.media_type = 'movie' AND wh.media_id = ms.media_id AND wh.blacklisted = 1
      LEFT JOIN comparison_staleness cs ON cs.media_type = 'movie' AND cs.media_id = ms.media_id
      WHERE ms.dimension_id = ?
        AND ms.media_type = 'movie'
        AND ms.excluded = 0
        AND wh.id IS NULL
        AND COALESCE(cs.staleness, 1.0) >= ?
      ORDER BY ms.comparison_count ASC, ms.score DESC`
    )
    .all(dimensionId, STALENESS_THRESHOLD) as Array<{
    mediaId: number;
    score: number;
    comparisonCount: number;
    title: string;
    moviePosterPath: string | null;
    movieTmdbId: number | null;
    moviePosterOverride: string | null;
  }>;

  if (rows.length === 0) return [];

  // If we have 8 or fewer, return them all
  if (rows.length <= MAX_TIER_LIST_MOVIES) {
    return rows.map(toTierListMovie);
  }

  // Build set of existing comparison pair keys for this dimension
  const existingPairs = new Set<string>();
  const pairRows = rawDb
    .prepare(
      `SELECT media_a_type, media_a_id, media_b_type, media_b_id
       FROM comparisons
       WHERE dimension_id = ?`
    )
    .all(dimensionId) as Array<{
    media_a_type: string;
    media_a_id: number;
    media_b_type: string;
    media_b_id: number;
  }>;
  for (const p of pairRows) {
    const [nAt, nAi, nBt, nBi] = normalizePairOrder(
      p.media_a_type,
      p.media_a_id,
      p.media_b_type,
      p.media_b_id
    );
    existingPairs.add(`${nAt}:${nAi}:${nBt}:${nBi}`);
  }

  // Greedy selection: pick movies that maximize new pairwise comparisons
  const selected: typeof rows = [];
  const selectedIds = new Set<number>();

  for (let round = 0; round < MAX_TIER_LIST_MOVIES && rows.length > 0; round++) {
    let bestIdx = -1;
    let bestNewPairs = -1;
    let bestCompCount = Infinity;

    for (let i = 0; i < rows.length; i++) {
      const candidate = rows[i];
      if (!candidate || selectedIds.has(candidate.mediaId)) continue;

      // Count new pairs this candidate would create with already-selected movies
      let newPairs = 0;
      for (const sel of selected) {
        const [nAt, nAi, nBt, nBi] = normalizePairOrder(
          "movie",
          candidate.mediaId,
          "movie",
          sel.mediaId
        );
        const key = `${nAt}:${nAi}:${nBt}:${nBi}`;
        if (!existingPairs.has(key)) {
          newPairs++;
        }
      }

      // Tie-break: more new pairs wins, then lower comparison count
      if (
        newPairs > bestNewPairs ||
        (newPairs === bestNewPairs && candidate.comparisonCount < bestCompCount)
      ) {
        bestIdx = i;
        bestNewPairs = newPairs;
        bestCompCount = candidate.comparisonCount;
      }
    }

    if (bestIdx === -1) break;
    const pick = rows[bestIdx];
    if (!pick) break;
    selected.push(pick);
    selectedIds.add(pick.mediaId);
  }

  return selected.map(toTierListMovie);
}

function toTierListMovie(row: {
  mediaId: number;
  title: string;
  moviePosterOverride: string | null;
  moviePosterPath: string | null;
  movieTmdbId: number | null;
  score: number;
  comparisonCount: number;
}): TierListMovie {
  return {
    id: row.mediaId,
    title: row.title,
    posterUrl: row.moviePosterOverride
      ? row.moviePosterOverride
      : row.moviePosterPath && row.movieTmdbId
        ? `/media/images/movie/${row.movieTmdbId}/poster.jpg`
        : null,
    score: Math.round(row.score * 10) / 10,
    comparisonCount: row.comparisonCount,
  };
}

// ── Debrief Dismiss ──

/**
 * Dismiss a debrief dimension — inserts a debrief_result with comparison_id=null
 * (marks the dimension as skipped). Auto-completes the session when all active
 * dimensions have results.
 */
export function dismissDebriefDimension(sessionId: number, dimensionId: number): void {
  const db = getDrizzle();

  // Verify session exists and is not complete
  const session = db.select().from(debriefSessions).where(eq(debriefSessions.id, sessionId)).get();

  if (!session) {
    throw new NotFoundError("Debrief session", String(sessionId));
  }
  if (session.status === "complete") {
    throw new ValidationError(`Debrief session ${sessionId} is already complete`);
  }

  // Verify dimension exists
  getDimension(dimensionId);

  // Check for duplicate dismiss
  const existing = db
    .select()
    .from(debriefResults)
    .where(
      and(eq(debriefResults.sessionId, sessionId), eq(debriefResults.dimensionId, dimensionId))
    )
    .get();

  if (existing) {
    throw new ConflictError(
      `Dimension ${dimensionId} already has a result for session ${sessionId}`
    );
  }

  // Insert debrief_result with null comparison_id (dismissed)
  db.insert(debriefResults).values({ sessionId, dimensionId, comparisonId: null }).run();

  // Mark debrief_status row as dismissed
  const watchEntry = db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (watchEntry) {
    db.update(debriefStatus)
      .set({ dismissed: 1 })
      .where(
        and(
          eq(debriefStatus.mediaType, watchEntry.mediaType),
          eq(debriefStatus.mediaId, watchEntry.mediaId),
          eq(debriefStatus.dimensionId, dimensionId)
        )
      )
      .run();
  }

  // Check if all active dimensions now have results → auto-complete
  const activeDims = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();

  const resultCount = db
    .select({ cnt: count() })
    .from(debriefResults)
    .where(eq(debriefResults.sessionId, sessionId))
    .get();

  if (resultCount && resultCount.cnt >= activeDims.length) {
    db.update(debriefSessions)
      .set({ status: "complete" })
      .where(eq(debriefSessions.id, sessionId))
      .run();
  }
}

/**
 * Normalize pair ordering so A-vs-B and B-vs-A map to the same row.
 * Sorts by (mediaType, mediaId) to ensure consistent key.
 */
function normalizePairOrder(
  aType: string,
  aId: number,
  bType: string,
  bId: number
): [string, number, string, number] {
  const keyA = `${aType}:${aId}`;
  const keyB = `${bType}:${bId}`;
  if (keyA <= keyB) return [aType, aId, bType, bId];
  return [bType, bId, aType, aId];
}

// ── Batch Record Comparisons ──

/**
 * Record multiple comparisons in a single transaction with ELO updates.
 *
 * All-or-nothing: if any comparison fails, the entire batch is rolled back.
 * Each comparison is inserted and its ELO scores are updated within the
 * same transaction. Returns the total count of comparisons recorded.
 */
export function batchRecordComparisons(
  dimensionId: number,
  items: BatchComparisonItem[],
  source?: string | null
): BatchRecordResult {
  const rawDb = getDb();
  const drizzleDb = getDrizzle();

  // Validate dimension exists and is active
  const dimension = getDimension(dimensionId);
  if (dimension.active !== 1) {
    throw new ValidationError("Cannot record comparisons for inactive dimension");
  }

  let insertedCount = 0;
  let skippedCount = 0;
  let hasOverrides = false;

  rawDb.transaction(() => {
    for (const item of items) {
      // Check for existing comparison on this pair+dimension
      const existing = findExistingComparison(
        dimensionId,
        item.mediaAType,
        item.mediaAId,
        item.mediaBType,
        item.mediaBId
      );

      if (existing) {
        if (sourceRank(source) >= sourceRank(existing.source)) {
          // Override: delete old row immediately to prevent stale lookups
          drizzleDb.delete(comparisons).where(eq(comparisons.id, existing.id)).run();
          hasOverrides = true;
        } else {
          // Skip: existing has higher authority
          skippedCount++;
          continue;
        }
      }

      // Insert without incremental ELO if any overrides — recalc will rebuild
      if (hasOverrides) {
        drizzleDb
          .insert(comparisons)
          .values({
            dimensionId,
            mediaAType: item.mediaAType,
            mediaAId: item.mediaAId,
            mediaBType: item.mediaBType,
            mediaBId: item.mediaBId,
            winnerType: item.winnerType,
            winnerId: item.winnerId,
            drawTier: item.drawTier ?? null,
            source: source ?? null,
          })
          .run();
      } else {
        const comparisonInput: RecordComparisonInput = {
          dimensionId,
          mediaAType: item.mediaAType,
          mediaAId: item.mediaAId,
          mediaBType: item.mediaBType,
          mediaBId: item.mediaBId,
          winnerType: item.winnerType,
          winnerId: item.winnerId,
          drawTier: item.drawTier ?? null,
        };

        // No overrides yet — compute Elo deltas incrementally
        const { deltaA, deltaB } = updateEloScores(comparisonInput);

        drizzleDb
          .insert(comparisons)
          .values({
            dimensionId,
            mediaAType: item.mediaAType,
            mediaAId: item.mediaAId,
            mediaBType: item.mediaBType,
            mediaBId: item.mediaBId,
            winnerType: item.winnerType,
            winnerId: item.winnerId,
            drawTier: item.drawTier ?? null,
            source: source ?? null,
            deltaA,
            deltaB,
          })
          .run();
      }

      insertedCount++;
    }

    // Full recalc inside the transaction for atomicity
    if (hasOverrides) {
      recalcDimensionElo(dimensionId);
    }
  })();

  return { count: insertedCount, skipped: skippedCount };
}

// ── Tier List Submission ──

/**
 * Submit a tier list: converts tier placements into pairwise comparisons.
 *
 * For each pair of placed movies, the higher-tier movie wins.
 * Movies in the same tier are recorded as a "mid" draw.
 * Also sets tier overrides for each placement.
 *
 * Returns the number of comparisons recorded and score deltas.
 */
export function submitTierList(input: SubmitTierListInput): SubmitTierListResult {
  const rawDb = getDb();
  const drizzleDb = getDrizzle();

  // Capture old scores for all placed movies
  const oldScores = new Map<number, number>();
  for (const placement of input.placements) {
    const existing = drizzleDb
      .select()
      .from(mediaScores)
      .where(
        and(
          eq(mediaScores.mediaType, "movie"),
          eq(mediaScores.mediaId, placement.movieId),
          eq(mediaScores.dimensionId, input.dimensionId)
        )
      )
      .get();
    oldScores.set(placement.movieId, existing?.score ?? 1500.0);
  }

  // Convert placements to pairwise comparisons, then to batch items
  const pairwise = convertTierPlacements(input.placements);
  const batchItems: BatchComparisonItem[] = pairwise.map((pair) => ({
    mediaAType: "movie" as const,
    mediaAId: pair.mediaAId,
    mediaBType: "movie" as const,
    mediaBId: pair.mediaBId,
    winnerType: "movie" as const,
    winnerId: pair.winnerId,
    drawTier: pair.drawTier,
  }));

  // Batch-record comparisons (validates dimension + inserts + ELO updates)
  const { count: comparisonsRecorded, skipped } = batchRecordComparisons(
    input.dimensionId,
    batchItems,
    "tier_list"
  );

  // Set tier overrides for each placement
  rawDb.transaction(() => {
    for (const placement of input.placements) {
      setTierOverride("movie", placement.movieId, input.dimensionId, placement.tier);
    }
  })();

  // Collect score changes
  const scoreChanges: ScoreChange[] = [];
  for (const placement of input.placements) {
    const newRow = drizzleDb
      .select()
      .from(mediaScores)
      .where(
        and(
          eq(mediaScores.mediaType, "movie"),
          eq(mediaScores.mediaId, placement.movieId),
          eq(mediaScores.dimensionId, input.dimensionId)
        )
      )
      .get();

    scoreChanges.push({
      movieId: placement.movieId,
      oldScore: oldScores.get(placement.movieId) ?? 1500.0,
      newScore: newRow?.score ?? 1500.0,
    });
  }

  return { comparisonsRecorded, skipped, scoreChanges };
}

// ── Debrief Comparison ──

/**
 * Record a debrief comparison for a session + dimension.
 * If winnerId > 0, records a real comparison via recordComparison and links it.
 * If winnerId = 0, creates a debrief_result with null comparison_id (skip).
 * Auto-completes the session when all active dimensions have results.
 */
export function recordDebriefComparison(input: RecordDebriefComparisonInput): {
  comparisonId: number | null;
  sessionComplete: boolean;
} {
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  // Validate session exists and is not complete
  const session = drizzleDb
    .select()
    .from(debriefSessions)
    .where(eq(debriefSessions.id, input.sessionId))
    .get();
  if (!session) throw new NotFoundError("Debrief session", String(input.sessionId));
  if (session.status === "complete") {
    throw new ValidationError("Debrief session is already complete");
  }

  // Get the debrief movie from watch_history
  const watchEntry = drizzleDb
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (!watchEntry) throw new NotFoundError("Watch history entry", String(session.watchHistoryId));

  // Check dimension hasn't already been recorded for this session
  const existingResult = drizzleDb
    .select()
    .from(debriefResults)
    .where(
      and(
        eq(debriefResults.sessionId, input.sessionId),
        eq(debriefResults.dimensionId, input.dimensionId)
      )
    )
    .get();
  if (existingResult) {
    throw new ConflictError("Dimension already recorded for this session");
  }

  return rawDb.transaction(() => {
    let comparisonId: number | null = null;

    if (input.winnerId > 0) {
      // Record a real comparison
      const compRow = recordComparison({
        dimensionId: input.dimensionId,
        mediaAType: watchEntry.mediaType as "movie" | "tv_show",
        mediaAId: watchEntry.mediaId,
        mediaBType: input.opponentType,
        mediaBId: input.opponentId,
        winnerType:
          input.winnerId === watchEntry.mediaId
            ? (watchEntry.mediaType as "movie" | "tv_show")
            : input.opponentType,
        winnerId: input.winnerId,
        drawTier: input.drawTier ?? null,
        source: "arena",
      });
      comparisonId = compRow.id;
    }

    // Create debrief_result
    drizzleDb
      .insert(debriefResults)
      .values({
        sessionId: input.sessionId,
        dimensionId: input.dimensionId,
        comparisonId,
      })
      .run();

    // Mark debrief_status row as debriefed
    drizzleDb
      .update(debriefStatus)
      .set({ debriefed: 1 })
      .where(
        and(
          eq(debriefStatus.mediaType, watchEntry.mediaType),
          eq(debriefStatus.mediaId, watchEntry.mediaId),
          eq(debriefStatus.dimensionId, input.dimensionId)
        )
      )
      .run();

    // Activate session if still pending
    if (session.status === "pending") {
      drizzleDb
        .update(debriefSessions)
        .set({ status: "active" })
        .where(eq(debriefSessions.id, input.sessionId))
        .run();
    }

    // Check if session is complete (all active dimensions have results)
    const activeDimCount = drizzleDb
      .select({ cnt: count() })
      .from(comparisonDimensions)
      .where(eq(comparisonDimensions.active, 1))
      .get();

    const resultCount = drizzleDb
      .select({ cnt: count() })
      .from(debriefResults)
      .where(eq(debriefResults.sessionId, input.sessionId))
      .get();

    const sessionComplete =
      activeDimCount !== undefined &&
      resultCount !== undefined &&
      resultCount.cnt >= activeDimCount.cnt;

    if (sessionComplete) {
      drizzleDb
        .update(debriefSessions)
        .set({ status: "complete" })
        .where(eq(debriefSessions.id, input.sessionId))
        .run();
    }

    return { comparisonId, sessionComplete };
  })();
}
