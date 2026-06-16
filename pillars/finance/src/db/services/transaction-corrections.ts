/**
 * Transaction-corrections CRUD for the finance domain.
 *
 * The `transaction_corrections` table stores learned patterns derived from
 * user-supplied corrections of imported transactions. Matching is a
 * priority-ordered scan over active rules — see PRD-024 and PRD-032 for
 * the runtime semantics this layer preserves.
 *
 * The in-tree service at
 * `apps/pops-api/src/modules/core/corrections/handlers/query-helpers.ts`
 * (and its sibling `pattern-match.ts`) still uses `getDrizzle()`; this
 * package version takes a `FinanceDb` handle as its first argument. PR 3 of
 * phase 1 flips the in-tree call sites to call into here.
 *
 * Mirrors the wish-list pattern: db-arg services, plain functions, typed
 * domain errors, no HTTP or tRPC concerns. Higher-level orchestrations
 * (changesets, AI rewrites, preview helpers) stay in-tree — they layer on
 * top of these primitives and migrate later in the slice cutover.
 *
 * The file is intentionally split into three siblings to stay under the
 * 200-line cap: types + normalisation in `transaction-corrections-types.ts`,
 * read-only matchers in `transaction-corrections-matching.ts`, write CRUD
 * here. All three surface through the `transactionCorrectionsService`
 * namespace on the package barrel.
 */
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { TransactionCorrectionNotFoundError } from '../errors.js';
import { transactionCorrections } from '../schema.js';
import {
  normalizeDescription,
  type CreateTransactionCorrectionInput,
  type TransactionCorrectionListQuery,
  type TransactionCorrectionListResult,
  type TransactionCorrectionRow,
  type UpdateTransactionCorrectionInput,
} from './transaction-corrections-types.js';

import type { FinanceDb } from './internal.js';

export * from './transaction-corrections-types.js';
export {
  findAllMatchingTransactionCorrections,
  findAllMatchingTransactionCorrectionsFromDb,
} from './transaction-corrections-matching.js';

/**
 * List corrections, ordered by `confidence DESC, timesApplied DESC`,
 * with optional minimum confidence and match-type filters.
 *
 * Returns both the paginated rows and the unpaginated total so the router
 * can render pagination controls without a second round trip.
 */
export function listTransactionCorrections(
  db: FinanceDb,
  query: TransactionCorrectionListQuery
): TransactionCorrectionListResult {
  const { minConfidence, matchType, limit, offset } = query;
  const conditions = [];
  if (minConfidence !== undefined) {
    conditions.push(gte(transactionCorrections.confidence, minConfidence));
  }
  if (matchType) {
    conditions.push(eq(transactionCorrections.matchType, matchType));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const countRow = db.select({ total: count() }).from(transactionCorrections).where(where).all()[0];

  const rows = db
    .select()
    .from(transactionCorrections)
    .where(where)
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .limit(limit)
    .offset(offset)
    .all();

  return { rows, total: countRow?.total ?? 0 };
}

/** Get a single correction by id. Throws `TransactionCorrectionNotFoundError` if missing. */
export function getTransactionCorrection(db: FinanceDb, id: string): TransactionCorrectionRow {
  const row = db
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.id, id))
    .get();
  if (!row) throw new TransactionCorrectionNotFoundError(id);
  return row;
}

function reinforceExistingCorrection(
  db: FinanceDb,
  existing: TransactionCorrectionRow,
  input: CreateTransactionCorrectionInput
): TransactionCorrectionRow {
  db.update(transactionCorrections)
    .set({
      confidence: Math.min(existing.confidence + 0.1, 1.0),
      timesApplied: existing.timesApplied + 1,
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
  return getTransactionCorrection(db, existing.id);
}

function insertNewCorrection(
  db: FinanceDb,
  input: CreateTransactionCorrectionInput,
  normalized: string
): TransactionCorrectionRow {
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

  const inserted = db
    .select()
    .from(transactionCorrections)
    .where(sql`rowid = ${result.lastInsertRowid}`)
    .get();

  if (!inserted) throw new TransactionCorrectionNotFoundError(String(result.lastInsertRowid));
  return inserted;
}

/**
 * Upsert a correction keyed on `(normalized descriptionPattern, matchType)`.
 *
 * On hit, the row is "reinforced" — confidence is bumped by 0.1 (capped at 1.0),
 * `timesApplied` is incremented, `lastUsedAt` is stamped, `isActive` is reset
 * to true, the `entityId` / `entityName` / `location` / `transactionType` /
 * `priority` fields are overlaid with the input only when the input value is
 * non-null (a `null` keeps the existing value), and `tags` is always
 * overwritten by `input.tags ?? []`. The last item is intentional and
 * matches the in-tree behaviour the cutover (PR 3) preserves — omitting
 * `tags` from a reinforcement clears them. Pass the existing tags through
 * explicitly if you want to keep them.
 *
 * On miss, a new row is inserted with confidence + timesApplied left at the
 * schema defaults (0.5 and 0 respectively).
 */
export function createOrUpdateTransactionCorrection(
  db: FinanceDb,
  input: CreateTransactionCorrectionInput
): TransactionCorrectionRow {
  const normalized = normalizeDescription(input.descriptionPattern);

  const existing = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.descriptionPattern, normalized),
        eq(transactionCorrections.matchType, input.matchType)
      )
    )
    .get();

  if (existing) return reinforceExistingCorrection(db, existing, input);
  return insertNewCorrection(db, input, normalized);
}

function buildCorrectionUpdates(
  input: UpdateTransactionCorrectionInput
): Partial<typeof transactionCorrections.$inferInsert> {
  const updates: Partial<typeof transactionCorrections.$inferInsert> = {};
  if (input.descriptionPattern !== undefined) {
    updates.descriptionPattern = normalizeDescription(input.descriptionPattern);
  }
  if (input.matchType !== undefined) updates.matchType = input.matchType;
  if (input.entityId !== undefined) updates.entityId = input.entityId;
  if (input.entityName !== undefined) updates.entityName = input.entityName;
  if (input.location !== undefined) updates.location = input.location;
  if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
  if (input.transactionType !== undefined) updates.transactionType = input.transactionType;
  if (input.isActive !== undefined) updates.isActive = input.isActive;
  if (input.confidence !== undefined) updates.confidence = input.confidence;
  if (input.priority !== undefined) updates.priority = input.priority;
  return updates;
}

/**
 * PATCH a correction. Throws `TransactionCorrectionNotFoundError` if missing.
 * Empty input still re-reads the row but skips the UPDATE — mirrors the
 * in-tree behaviour the routers already depend on.
 */
export function updateTransactionCorrection(
  db: FinanceDb,
  id: string,
  input: UpdateTransactionCorrectionInput
): TransactionCorrectionRow {
  const existing = getTransactionCorrection(db, id);
  const updates = buildCorrectionUpdates(input);

  if (Object.keys(updates).length === 0) return existing;

  db.update(transactionCorrections).set(updates).where(eq(transactionCorrections.id, id)).run();

  return getTransactionCorrection(db, id);
}

/** Delete a correction. Throws `TransactionCorrectionNotFoundError` if it never existed. */
export function deleteTransactionCorrection(db: FinanceDb, id: string): void {
  const result = db.delete(transactionCorrections).where(eq(transactionCorrections.id, id)).run();
  if (result.changes === 0) throw new TransactionCorrectionNotFoundError(id);
}

/**
 * Bump `timesApplied` and stamp `lastUsedAt` without otherwise touching the row.
 *
 * Silently no-ops if `id` does not exist — the in-tree caller treats this as
 * a best-effort telemetry update inside the import pipeline and doesn't want
 * the surrounding transaction to fail on a stale id.
 */
export function incrementTransactionCorrectionUsage(db: FinanceDb, id: string): void {
  db.update(transactionCorrections)
    .set({
      timesApplied: sql`${transactionCorrections.timesApplied} + 1`,
      lastUsedAt: new Date().toISOString(),
    })
    .where(eq(transactionCorrections.id, id))
    .run();
}

/**
 * Nudge a correction's confidence by `delta`, clamped to `[0, 1]`.
 *
 * When the resulting confidence is below 0.3 the row is deleted — the import
 * pipeline uses this to garbage-collect rules that the user has consistently
 * rejected. Throws `TransactionCorrectionNotFoundError` if `id` is missing.
 */
export function adjustTransactionCorrectionConfidence(
  db: FinanceDb,
  id: string,
  delta: number
): void {
  const existing = getTransactionCorrection(db, id);
  const newConfidence = Math.max(0, Math.min(1, existing.confidence + delta));

  db.update(transactionCorrections)
    .set({ confidence: newConfidence })
    .where(eq(transactionCorrections.id, id))
    .run();

  if (newConfidence < 0.3) {
    deleteTransactionCorrection(db, id);
  }
}
