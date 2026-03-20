/**
 * Transaction corrections service
 * Manages learned patterns from user edits — Drizzle ORM
 */
import { eq, gte, desc, count, sql, and } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { transactionCorrections } from "@pops/db-types";
import { NotFoundError } from "../../../shared/errors.js";
import type { CorrectionRow, CreateCorrectionInput, UpdateCorrectionInput } from "./types.js";
import { normalizeDescription } from "./types.js";

/**
 * Find the best matching correction for a description
 */
export function findMatchingCorrection(
  description: string,
  minConfidence: number = 0.7
): CorrectionRow | null {
  const db = getDrizzle();
  const normalized = normalizeDescription(description);

  // Try exact match first (highest priority)
  const [exactMatch] = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, "exact"),
        eq(transactionCorrections.descriptionPattern, normalized),
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .limit(1)
    .all();

  if (exactMatch) return exactMatch;

  // Try contains match (pattern is substring of description)
  // This uses SQL LIKE which needs raw SQL for the dynamic pattern
  const [containsMatch] = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, "contains"),
        sql`${normalized} LIKE '%' || ${transactionCorrections.descriptionPattern} || '%'`,
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .limit(1)
    .all();

  if (containsMatch) return containsMatch;

  return null;
}

/**
 * List all corrections with optional filters
 */
export function listCorrections(
  minConfidence?: number,
  limit: number = 50,
  offset: number = 0
): { rows: CorrectionRow[]; total: number } {
  const db = getDrizzle();

  const condition =
    minConfidence !== undefined ? gte(transactionCorrections.confidence, minConfidence) : undefined;

  const [countResult] = db
    .select({ count: count() })
    .from(transactionCorrections)
    .where(condition)
    .all();

  const rows = db
    .select()
    .from(transactionCorrections)
    .where(condition)
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .limit(limit)
    .offset(offset)
    .all();

  return { rows: rows, total: countResult.count };
}

/**
 * Get a single correction by ID
 */
export function getCorrection(id: string): CorrectionRow {
  const db = getDrizzle();
  const [row] = db
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.id, id))
    .all();

  if (!row) {
    throw new NotFoundError("Correction", id);
  }

  return row;
}

/**
 * Find all corrections that match a description (for tag union across all rules)
 */
export function findAllMatchingCorrections(description: string): CorrectionRow[] {
  const db = getDrizzle();
  const normalized = normalizeDescription(description);

  const exactMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, "exact"),
        eq(transactionCorrections.descriptionPattern, normalized)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const containsMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, "contains"),
        sql`${normalized} LIKE '%' || ${transactionCorrections.descriptionPattern} || '%'`
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  return [...exactMatches, ...containsMatches];
}

/**
 * Create a new correction or update existing one
 */
export function createOrUpdateCorrection(input: CreateCorrectionInput): CorrectionRow {
  const db = getDrizzle();
  const normalized = normalizeDescription(input.descriptionPattern);

  // Check if pattern already exists
  const [existing] = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.descriptionPattern, normalized),
        eq(transactionCorrections.matchType, input.matchType)
      )
    )
    .all();

  if (existing) {
    // Update existing correction
    const newConfidence = Math.min(existing.confidence + 0.1, 1.0);
    const newTimesApplied = existing.timesApplied + 1;

    db.update(transactionCorrections)
      .set({
        confidence: newConfidence,
        timesApplied: newTimesApplied,
        lastUsedAt: sql`datetime('now')`,
        entityId: input.entityId ?? existing.entityId,
        entityName: input.entityName ?? existing.entityName,
        location: input.location ?? existing.location,
        tags: JSON.stringify(input.tags ?? []),
        transactionType: input.transactionType ?? existing.transactionType,
      })
      .where(eq(transactionCorrections.id, existing.id))
      .run();

    return getCorrection(existing.id);
  }

  // Insert new correction
  const result = db
    .insert(transactionCorrections)
    .values({
      descriptionPattern: normalized,
      matchType: input.matchType,
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      tags: JSON.stringify(input.tags ?? []),
      transactionType: input.transactionType ?? null,
    })
    .run();

  // lastInsertRowid is the integer rowid, not the UUID text primary key.
  // Look up by rowid to retrieve the auto-generated UUID.
  const [inserted] = db
    .select()
    .from(transactionCorrections)
    .where(sql`rowid = ${result.lastInsertRowid}`)
    .all();

  if (!inserted) {
    throw new NotFoundError("Correction", String(result.lastInsertRowid));
  }

  return inserted;
}

/**
 * Update an existing correction
 */
export function updateCorrection(id: string, input: UpdateCorrectionInput): CorrectionRow {
  const db = getDrizzle();
  const existing = getCorrection(id); // Throws if not found

  const updates: Partial<typeof transactionCorrections.$inferInsert> = {};
  let hasUpdates = false;

  if (input.entityId !== undefined) {
    updates.entityId = input.entityId;
    hasUpdates = true;
  }
  if (input.entityName !== undefined) {
    updates.entityName = input.entityName;
    hasUpdates = true;
  }
  if (input.location !== undefined) {
    updates.location = input.location;
    hasUpdates = true;
  }
  if (input.tags !== undefined) {
    updates.tags = JSON.stringify(input.tags);
    hasUpdates = true;
  }
  if (input.transactionType !== undefined) {
    updates.transactionType = input.transactionType;
    hasUpdates = true;
  }
  if (input.confidence !== undefined) {
    updates.confidence = input.confidence;
    hasUpdates = true;
  }

  if (!hasUpdates) {
    return existing; // No changes
  }

  db.update(transactionCorrections).set(updates).where(eq(transactionCorrections.id, id)).run();

  return getCorrection(id);
}

/**
 * Delete a correction
 */
export function deleteCorrection(id: string): void {
  const db = getDrizzle();
  const result = db.delete(transactionCorrections).where(eq(transactionCorrections.id, id)).run();

  if (result.changes === 0) {
    throw new NotFoundError("Correction", id);
  }
}

/**
 * Increment usage stats for a correction
 */
export function incrementCorrectionUsage(id: string): void {
  const db = getDrizzle();
  db.update(transactionCorrections)
    .set({
      timesApplied: sql`${transactionCorrections.timesApplied} + 1`,
      lastUsedAt: sql`datetime('now')`,
    })
    .where(eq(transactionCorrections.id, id))
    .run();
}

/**
 * Adjust confidence score
 */
export function adjustConfidence(id: string, delta: number): void {
  const db = getDrizzle();
  const existing = getCorrection(id);
  const newConfidence = Math.max(0, Math.min(1, existing.confidence + delta));

  db.update(transactionCorrections)
    .set({ confidence: newConfidence })
    .where(eq(transactionCorrections.id, id))
    .run();

  // Auto-delete if confidence too low
  if (newConfidence < 0.3) {
    deleteCorrection(id);
  }
}
