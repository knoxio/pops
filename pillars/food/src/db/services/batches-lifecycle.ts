/**
 * Batch lifecycle services. Companion `batches.ts` owns `consumeForRun`
 * (FIFO drain); this file owns every other batch mutation plus
 * `createBatchFromRun`, which wraps `markRunComplete` so cook-event
 * recording has one batch-creation entry point.
 */
import { and, eq, gt, isNotNull } from 'drizzle-orm';

import { batches, type BatchRow } from '../schema.js';
import {
  appendAuditNote,
  deriveAutoDefaultExpiry,
  describeAdjust,
  isBefore,
  isSameInstant,
  today,
} from './batches-lifecycle-helpers.js';
import { type FoodDb, expectRow } from './internal.js';
import { markRunComplete, type YieldArgs as RecipeRunYieldArgs } from './recipe-runs.js';

import type {
  BatchAdjustReason,
  BatchAdjustResult,
  BatchEditPatch,
  BatchError,
  BatchLocation,
  BatchMutationResult,
  ManualBatchInput,
  YieldArgs,
} from '../../domain/types/batches.js';

/** Yieldless cooks pass `null` and get `batchId: null` back. */
export function createBatchFromRun(
  db: FoodDb,
  runId: number,
  yieldArgs: YieldArgs | null
): { batchId: number | null } {
  const opts = yieldArgs === null ? {} : { yield: toRecipeRunYieldArgs(yieldArgs) };
  const result = markRunComplete(db, runId, opts);
  return { batchId: result.yieldedBatch?.id ?? null };
}

function toRecipeRunYieldArgs(y: YieldArgs): RecipeRunYieldArgs {
  return {
    variantId: y.variantId,
    prepStateId: y.prepStateId,
    qty: y.qty,
    unit: y.unit,
    location: y.location,
    expiresAt: y.expiresAt,
    notes: y.notes,
  };
}

export function createBatchManual(
  db: FoodDb,
  input: ManualBatchInput
): { ok: true; batchId: number } | { ok: false; reason: BatchError } {
  const producedAt = input.producedAt ?? new Date().toISOString();
  const expiresAt =
    input.expiresAt !== undefined
      ? input.expiresAt
      : deriveAutoDefaultExpiry(db, input.variantId, input.location, producedAt);
  if (expiresAt !== null && isBefore(expiresAt, producedAt)) {
    return { ok: false, reason: 'BadExpiry' };
  }
  const rows = db
    .insert(batches)
    .values({
      variantId: input.variantId,
      prepStateId: input.prepStateId,
      qtyRemaining: input.qty,
      unit: input.unit,
      sourceType: input.sourceType,
      sourceId: null,
      location: input.location,
      producedAt,
      expiresAt,
      notes: input.notes ?? null,
    })
    .returning()
    .all();
  return { ok: true, batchId: expectRow(rows, 'createBatchManual').id };
}

/**
 * Recomputes expiry only when the stored value matches the
 * previous-location auto-default — otherwise the user's override is
 * preserved. Appends "Moved to <location> on <date>" to notes.
 */
export function relocateBatch(
  db: FoodDb,
  batchId: number,
  newLocation: BatchLocation
): BatchMutationResult {
  return db.transaction((tx) => {
    const batch = loadBatch(tx, batchId);
    if (batch === null) return { ok: false, reason: 'BatchNotFound' };
    if (batch.deletedAt !== null) return { ok: false, reason: 'BatchDeleted' };

    const previousAutoExpiry = deriveAutoDefaultExpiry(
      tx,
      batch.variantId,
      batch.location,
      batch.producedAt
    );
    const nextExpiry = isSameInstant(batch.expiresAt, previousAutoExpiry)
      ? deriveAutoDefaultExpiry(tx, batch.variantId, newLocation, batch.producedAt)
      : batch.expiresAt;
    const nextNotes = appendAuditNote(batch.notes, `Moved to ${newLocation} on ${today()}`);

    tx.update(batches)
      .set({ location: newLocation, expiresAt: nextExpiry, notes: nextNotes })
      .where(eq(batches.id, batchId))
      .run();
    return { ok: true };
  });
}

/** `prep_state_id` is forbidden on cook-yielded batches (pinned to recipe yield). */
export function editBatch(db: FoodDb, batchId: number, patch: BatchEditPatch): BatchMutationResult {
  return db.transaction((tx) => {
    const batch = loadBatch(tx, batchId);
    if (batch === null) return { ok: false, reason: 'BatchNotFound' };
    if (batch.deletedAt !== null) return { ok: false, reason: 'BatchDeleted' };
    if (patch.prepStateId !== undefined && batch.sourceType === 'recipe_run') {
      return { ok: false, reason: 'CannotEditFromRun' };
    }
    if (
      patch.expiresAt !== undefined &&
      patch.expiresAt !== null &&
      isBefore(patch.expiresAt, batch.producedAt)
    ) {
      return { ok: false, reason: 'BadExpiry' };
    }

    const updates = buildEditUpdates(patch);
    if (Object.keys(updates).length === 0) return { ok: true };
    tx.update(batches).set(updates).where(eq(batches.id, batchId)).run();
    return { ok: true };
  });
}

function buildEditUpdates(patch: BatchEditPatch): Partial<{
  expiresAt: string | null;
  notes: string | null;
  prepStateId: number | null;
}> {
  const updates: Partial<{
    expiresAt: string | null;
    notes: string | null;
    prepStateId: number | null;
  }> = {};
  if (patch.expiresAt !== undefined) updates.expiresAt = patch.expiresAt;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.prepStateId !== undefined) updates.prepStateId = patch.prepStateId;
  return updates;
}

/**
 * `spoiled` / `wasted` require `delta < 0`; `correction` accepts any
 * sign. Rejects pushing qty below zero. Audit line appended to notes.
 */
export function adjustBatchQty(
  db: FoodDb,
  batchId: number,
  delta: number,
  reason: BatchAdjustReason
): BatchAdjustResult {
  return db.transaction((tx) => {
    const batch = loadBatch(tx, batchId);
    if (batch === null) return { ok: false, reason: 'BatchNotFound' };
    if (batch.deletedAt !== null) return { ok: false, reason: 'BatchDeleted' };
    if ((reason === 'spoiled' || reason === 'wasted') && delta >= 0) {
      return { ok: false, reason: 'BadAdjustment' };
    }
    const newQty = batch.qtyRemaining + delta;
    if (newQty < 0) return { ok: false, reason: 'NegativeQty' };
    if (delta === 0) return { ok: true, newQty: batch.qtyRemaining };

    const nextNotes = appendAuditNote(batch.notes, describeAdjust(reason, delta, batch.unit));
    tx.update(batches)
      .set({ qtyRemaining: newQty, notes: nextNotes })
      .where(eq(batches.id, batchId))
      .run();
    return { ok: true, newQty };
  });
}

/**
 * One UPDATE so the invariant `deleted_at IS NOT NULL → qty_remaining = 0`
 * holds at every observable point. Hard delete is never exposed.
 */
export function deleteBatch(db: FoodDb, batchId: number): BatchMutationResult {
  return db.transaction((tx) => {
    const batch = loadBatch(tx, batchId);
    if (batch === null) return { ok: false, reason: 'BatchNotFound' };
    if (batch.deletedAt !== null) return { ok: false, reason: 'BatchDeleted' };
    tx.update(batches)
      .set({ qtyRemaining: 0, deletedAt: new Date().toISOString() })
      .where(eq(batches.id, batchId))
      .run();
    return { ok: true };
  });
}

function loadBatch(db: FoodDb, batchId: number): BatchRow | null {
  const rows = db.select().from(batches).where(eq(batches.id, batchId)).all();
  return rows[0] ?? null;
}

/** Test-only invariant scan: post-suite check that no deleted batch retains qty. */
export function countDeletedInvariantViolations(db: FoodDb): number {
  const rows = db
    .select({ id: batches.id })
    .from(batches)
    .where(and(isNotNull(batches.deletedAt), gt(batches.qtyRemaining, 0)))
    .all();
  return rows.length;
}
