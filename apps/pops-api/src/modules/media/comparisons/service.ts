/**
 * Comparisons service — dimensions, 1v1 comparisons, and Elo scores.
 */
import { eq, and, or, asc, count, desc } from "drizzle-orm";
import { getDb, getDrizzle } from "../../../db.js";
import {
  comparisonDimensions,
  comparisons,
  mediaScores,
} from "@pops/db-types";
import { NotFoundError, ConflictError, ValidationError } from "../../../shared/errors.js";
import type {
  ComparisonDimensionRow,
  ComparisonRow,
  MediaScoreRow,
  CreateDimensionInput,
  UpdateDimensionInput,
  RecordComparisonInput,
} from "./types.js";

// ── Dimensions ──

export function listDimensions(): ComparisonDimensionRow[] {
  const db = getDrizzle();
  return db
    .select()
    .from(comparisonDimensions)
    .orderBy(asc(comparisonDimensions.sortOrder))
    .all();
}

export function getDimension(id: number): ComparisonDimensionRow {
  const db = getDrizzle();
  const row = db
    .select()
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.id, id))
    .get();
  if (!row) throw new NotFoundError("Dimension", String(id));
  return row;
}

export function createDimension(
  input: CreateDimensionInput,
): ComparisonDimensionRow {
  const db = getDrizzle();

  const existing = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.name, input.name))
    .get();
  if (existing) {
    throw new ConflictError(
      `Dimension '${input.name}' already exists`,
    );
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

export function updateDimension(
  id: number,
  input: UpdateDimensionInput,
): ComparisonDimensionRow {
  const db = getDrizzle();
  getDimension(id); // verify exists

  const updates: Partial<typeof comparisonDimensions.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined)
    updates.description = input.description ?? null;
  if (input.active !== undefined) updates.active = input.active ? 1 : 0;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

  if (Object.keys(updates).length > 0) {
    db.update(comparisonDimensions)
      .set(updates)
      .where(eq(comparisonDimensions.id, id))
      .run();
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
export function recordComparison(
  input: RecordComparisonInput,
): ComparisonRow {
  const drizzleDb = getDrizzle();

  // Verify dimension exists
  getDimension(input.dimensionId);

  // Validate winner matches one of the two media items
  const winnerIsA =
    input.winnerType === input.mediaAType && input.winnerId === input.mediaAId;
  const winnerIsB =
    input.winnerType === input.mediaBType && input.winnerId === input.mediaBId;

  if (!winnerIsA && !winnerIsB) {
    throw new ValidationError(
      "Winner must match either media A or media B",
    );
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

function getOrCreateScore(
  mediaType: string,
  mediaId: number,
  dimensionId: number,
): MediaScoreRow {
  const db = getDrizzle();

  const existing = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.mediaId, mediaId),
        eq(mediaScores.dimensionId, dimensionId),
      ),
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

  return db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.mediaId, mediaId),
        eq(mediaScores.dimensionId, dimensionId),
      ),
    )
    .get()!;
}

function updateEloScores(input: RecordComparisonInput): void {
  const db = getDrizzle();

  const scoreA = getOrCreateScore(
    input.mediaAType,
    input.mediaAId,
    input.dimensionId,
  );
  const scoreB = getOrCreateScore(
    input.mediaBType,
    input.mediaBId,
    input.dimensionId,
  );

  const expectedA = expectedScore(scoreA.score, scoreB.score);
  const expectedB = expectedScore(scoreB.score, scoreA.score);

  const actualA =
    input.winnerType === input.mediaAType &&
    input.winnerId === input.mediaAId
      ? 1
      : 0;
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
  offset: number,
): ComparisonListResult {
  const db = getDrizzle();

  const mediaCondition = or(
    and(
      eq(comparisons.mediaAType, mediaType),
      eq(comparisons.mediaAId, mediaId),
    ),
    and(
      eq(comparisons.mediaBType, mediaType),
      eq(comparisons.mediaBId, mediaId),
    ),
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

  const [{ total }] = db
    .select({ total: count() })
    .from(comparisons)
    .where(conditions)
    .all();

  return { rows, total };
}

// ── Scores ──

export function getScoresForMedia(
  mediaType: string,
  mediaId: number,
  dimensionId?: number,
): MediaScoreRow[] {
  const db = getDrizzle();

  const conditions = [
    eq(mediaScores.mediaType, mediaType),
    eq(mediaScores.mediaId, mediaId),
  ];
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
