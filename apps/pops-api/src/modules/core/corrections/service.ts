/**
 * Transaction corrections service
 * Manages learned patterns from user edits
 */
import { getDb } from "../../../db.js";
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
  const db = getDb();
  const normalized = normalizeDescription(description);

  // Try exact match first (highest priority)
  const exactMatch = db
    .prepare(
      `
    SELECT * FROM transaction_corrections
    WHERE match_type = 'exact'
      AND description_pattern = ?
      AND confidence >= ?
    ORDER BY confidence DESC, times_applied DESC
    LIMIT 1
  `
    )
    .get(normalized, minConfidence) as CorrectionRow | undefined;

  if (exactMatch) return exactMatch;

  // Try contains match (pattern is substring of description)
  const containsMatch = db
    .prepare(
      `
    SELECT * FROM transaction_corrections
    WHERE match_type = 'contains'
      AND ? LIKE '%' || description_pattern || '%'
      AND confidence >= ?
    ORDER BY confidence DESC, times_applied DESC
    LIMIT 1
  `
    )
    .get(normalized, minConfidence) as CorrectionRow | undefined;

  if (containsMatch) return containsMatch;

  // TODO: Regex matching if needed (more expensive)
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
  const db = getDb();
  const whereClause = minConfidence !== undefined ? "WHERE confidence >= ?" : "";
  const params = minConfidence !== undefined ? [minConfidence] : [];

  const total = (
    db
      .prepare(`SELECT COUNT(*) as count FROM transaction_corrections ${whereClause}`)
      .get(...params) as { count: number }
  ).count;

  const rows = db
    .prepare(
      `
    SELECT * FROM transaction_corrections
    ${whereClause}
    ORDER BY confidence DESC, times_applied DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset) as CorrectionRow[];

  return { rows, total };
}

/**
 * Get a single correction by ID
 */
export function getCorrection(id: string): CorrectionRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM transaction_corrections WHERE id = ?").get(id) as
    | CorrectionRow
    | undefined;

  if (!row) {
    throw new NotFoundError("Correction", id);
  }

  return row;
}

/**
 * Find all corrections that match a description (for tag union across all rules)
 */
export function findAllMatchingCorrections(description: string): CorrectionRow[] {
  const db = getDb();
  const normalized = normalizeDescription(description);

  const exactMatches = db
    .prepare(
      `
    SELECT * FROM transaction_corrections
    WHERE match_type = 'exact' AND description_pattern = ?
    ORDER BY confidence DESC, times_applied DESC
  `
    )
    .all(normalized) as CorrectionRow[];

  const containsMatches = db
    .prepare(
      `
    SELECT * FROM transaction_corrections
    WHERE match_type = 'contains'
      AND ? LIKE '%' || description_pattern || '%'
    ORDER BY confidence DESC, times_applied DESC
  `
    )
    .all(normalized) as CorrectionRow[];

  return [...exactMatches, ...containsMatches];
}

/**
 * Create a new correction or update existing one
 */
export function createOrUpdateCorrection(input: CreateCorrectionInput): CorrectionRow {
  const db = getDb();
  const normalized = normalizeDescription(input.descriptionPattern);

  // Check if pattern already exists
  const existing = db
    .prepare(
      `
    SELECT * FROM transaction_corrections
    WHERE description_pattern = ? AND match_type = ?
  `
    )
    .get(normalized, input.matchType) as CorrectionRow | undefined;

  if (existing) {
    // Update existing correction
    const newConfidence = Math.min(existing.confidence + 0.1, 1.0);
    const newTimesApplied = existing.times_applied + 1;

    db.prepare(
      `
      UPDATE transaction_corrections
      SET confidence = ?,
          times_applied = ?,
          last_used_at = datetime('now'),
          entity_id = COALESCE(?, entity_id),
          entity_name = COALESCE(?, entity_name),
          location = COALESCE(?, location),
          tags = ?,
          transaction_type = COALESCE(?, transaction_type)
      WHERE id = ?
    `
    ).run(
      newConfidence,
      newTimesApplied,
      input.entityId ?? null,
      input.entityName ?? null,
      input.location ?? null,
      JSON.stringify(input.tags ?? []),
      input.transactionType ?? null,
      existing.id
    );

    return getCorrection(existing.id);
  }

  // Insert new correction
  const result = db
    .prepare(
      `
    INSERT INTO transaction_corrections (
      description_pattern, match_type, entity_id, entity_name,
      location, tags, transaction_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      normalized,
      input.matchType,
      input.entityId ?? null,
      input.entityName ?? null,
      input.location ?? null,
      JSON.stringify(input.tags ?? []),
      input.transactionType ?? null
    );

  // lastInsertRowid is the integer rowid, not the UUID text primary key.
  // Look up by rowid to retrieve the auto-generated UUID.
  const inserted = db
    .prepare("SELECT * FROM transaction_corrections WHERE rowid = ?")
    .get(result.lastInsertRowid) as CorrectionRow | undefined;

  if (!inserted) {
    throw new NotFoundError("Correction", String(result.lastInsertRowid));
  }

  return inserted;
}

/**
 * Update an existing correction
 */
export function updateCorrection(id: string, input: UpdateCorrectionInput): CorrectionRow {
  const db = getDb();
  const existing = getCorrection(id); // Throws if not found

  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.entityId !== undefined) {
    updates.push("entity_id = ?");
    values.push(input.entityId);
  }
  if (input.entityName !== undefined) {
    updates.push("entity_name = ?");
    values.push(input.entityName);
  }
  if (input.location !== undefined) {
    updates.push("location = ?");
    values.push(input.location);
  }
  if (input.tags !== undefined) {
    updates.push("tags = ?");
    values.push(JSON.stringify(input.tags));
  }
  if (input.transactionType !== undefined) {
    updates.push("transaction_type = ?");
    values.push(input.transactionType);
  }
  if (input.confidence !== undefined) {
    updates.push("confidence = ?");
    values.push(input.confidence);
  }

  if (updates.length === 0) {
    return existing; // No changes
  }

  values.push(id);

  db.prepare(`UPDATE transaction_corrections SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return getCorrection(id);
}

/**
 * Delete a correction
 */
export function deleteCorrection(id: string): void {
  const db = getDb();
  const result = db.prepare("DELETE FROM transaction_corrections WHERE id = ?").run(id);

  if (result.changes === 0) {
    throw new NotFoundError("Correction", id);
  }
}

/**
 * Increment usage stats for a correction
 */
export function incrementCorrectionUsage(id: string): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE transaction_corrections
    SET times_applied = times_applied + 1,
        last_used_at = datetime('now')
    WHERE id = ?
  `
  ).run(id);
}

/**
 * Adjust confidence score
 */
export function adjustConfidence(id: string, delta: number): void {
  const db = getDb();
  const existing = getCorrection(id);
  const newConfidence = Math.max(0, Math.min(1, existing.confidence + delta));

  db.prepare(`UPDATE transaction_corrections SET confidence = ? WHERE id = ?`).run(
    newConfidence,
    id
  );

  // Auto-delete if confidence too low
  if (newConfidence < 0.3) {
    deleteCorrection(id);
  }
}
