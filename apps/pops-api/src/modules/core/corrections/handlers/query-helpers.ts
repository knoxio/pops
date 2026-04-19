import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { transactionCorrections } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { NotFoundError } from '../../../../shared/errors.js';
import { normalizeDescription } from '../types.js';

import type { CorrectionRow, CreateCorrectionInput, UpdateCorrectionInput } from '../types.js';

export function listCorrections(
  minConfidence?: number,
  limit: number = 50,
  offset: number = 0,
  matchType?: 'exact' | 'contains' | 'regex'
): { rows: CorrectionRow[]; total: number } {
  const db = getDrizzle();

  const conditions = [];
  if (minConfidence !== undefined) {
    conditions.push(gte(transactionCorrections.confidence, minConfidence));
  }
  if (matchType) {
    conditions.push(eq(transactionCorrections.matchType, matchType));
  }
  const condition = conditions.length > 0 ? and(...conditions) : undefined;

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

  return { rows, total: countResult?.count ?? 0 };
}

export function getCorrection(id: string): CorrectionRow {
  const db = getDrizzle();
  const [row] = db
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.id, id))
    .all();

  if (!row) {
    throw new NotFoundError('Correction', id);
  }

  return row;
}

export function createOrUpdateCorrection(input: CreateCorrectionInput): CorrectionRow {
  const db = getDrizzle();
  const normalized = normalizeDescription(input.descriptionPattern);

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
    const newConfidence = Math.min(existing.confidence + 0.1, 1.0);
    const newTimesApplied = existing.timesApplied + 1;

    db.update(transactionCorrections)
      .set({
        confidence: newConfidence,
        timesApplied: newTimesApplied,
        lastUsedAt: new Date().toISOString(),
        entityId: input.entityId ?? existing.entityId,
        entityName: input.entityName ?? existing.entityName,
        location: input.location ?? existing.location,
        tags: JSON.stringify(input.tags ?? []),
        transactionType: input.transactionType ?? existing.transactionType,
        priority: input.priority ?? existing.priority,
        isActive: true,
      })
      .where(eq(transactionCorrections.id, existing.id))
      .run();

    return getCorrection(existing.id);
  }

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
      priority: input.priority ?? 0,
      isActive: true,
    })
    .run();

  // lastInsertRowid is the integer rowid, not the UUID text primary key.
  const [inserted] = db
    .select()
    .from(transactionCorrections)
    .where(sql`rowid = ${result.lastInsertRowid}`)
    .all();

  if (!inserted) {
    throw new NotFoundError('Correction', String(result.lastInsertRowid));
  }

  return inserted;
}

export function updateCorrection(id: string, input: UpdateCorrectionInput): CorrectionRow {
  const db = getDrizzle();
  const existing = getCorrection(id);

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
  if (input.isActive !== undefined) {
    updates.isActive = input.isActive;
    hasUpdates = true;
  }
  if (input.confidence !== undefined) {
    updates.confidence = input.confidence;
    hasUpdates = true;
  }
  if (input.priority !== undefined) {
    updates.priority = input.priority;
    hasUpdates = true;
  }

  if (!hasUpdates) {
    return existing;
  }

  db.update(transactionCorrections).set(updates).where(eq(transactionCorrections.id, id)).run();

  return getCorrection(id);
}

export function deleteCorrection(id: string): void {
  const db = getDrizzle();
  const result = db.delete(transactionCorrections).where(eq(transactionCorrections.id, id)).run();

  if (result.changes === 0) {
    throw new NotFoundError('Correction', id);
  }
}

export function incrementCorrectionUsage(id: string): void {
  const db = getDrizzle();
  db.update(transactionCorrections)
    .set({
      timesApplied: sql`${transactionCorrections.timesApplied} + 1`,
      lastUsedAt: new Date().toISOString(),
    })
    .where(eq(transactionCorrections.id, id))
    .run();
}

export function adjustConfidence(id: string, delta: number): void {
  const db = getDrizzle();
  const existing = getCorrection(id);
  const newConfidence = Math.max(0, Math.min(1, existing.confidence + delta));

  db.update(transactionCorrections)
    .set({ confidence: newConfidence })
    .where(eq(transactionCorrections.id, id))
    .run();

  if (newConfidence < 0.3) {
    deleteCorrection(id);
  }
}
