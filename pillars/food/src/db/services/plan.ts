import { and, asc, eq, sql } from 'drizzle-orm';

import { assertValidSlug } from '../../domain/slug.js';
import {
  PlanEntryHasCookEvent,
  PlanEntryNotFound,
  PlanSlotInUse,
  PlanSlotIsDefault,
  PlanSlotNotFound,
  PlanSlotSlugAlreadyExists,
} from '../errors.js';
import { planEntries, planSlots, type PlanEntryRow, type PlanSlotRow } from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

export interface AddPlanEntryInput {
  date: string;
  slot: string;
  recipeId: number;
  recipeVersionId?: number | null;
  plannedServings?: number;
  position?: number;
  notes?: string | null;
}

export function addPlanEntry(db: FoodDb, input: AddPlanEntryInput): PlanEntryRow {
  const position = input.position ?? nextPositionForSlot(db, input.date, input.slot);
  const rows = db
    .insert(planEntries)
    .values({
      date: input.date,
      slot: input.slot,
      position,
      recipeId: input.recipeId,
      recipeVersionId: input.recipeVersionId ?? null,
      plannedServings: input.plannedServings ?? 1,
      notes: input.notes ?? null,
    })
    .returning()
    .all();
  return expectRow(rows, `addPlanEntry(${input.date}/${input.slot})`);
}

/**
 * Append-at-end position when the caller doesn't pin one. Reorders are
 * last-write-wins; concurrent appends in single-user mode are rare enough
 * to ignore.
 */
function nextPositionForSlot(db: FoodDb, date: string, slot: string): number {
  const rows = db
    .select({ max: sql<number | null>`max(${planEntries.position})` })
    .from(planEntries)
    .where(and(eq(planEntries.date, date), eq(planEntries.slot, slot)))
    .all();
  const current = rows[0]?.max;
  return current === null || current === undefined ? 0 : current + 1;
}

export function removePlanEntry(db: FoodDb, planEntryId: number): void {
  const existing = db
    .select({ id: planEntries.id, recipeRunId: planEntries.recipeRunId })
    .from(planEntries)
    .where(eq(planEntries.id, planEntryId))
    .all();
  const row = existing[0];
  if (row === undefined) {
    throw new PlanEntryNotFound(planEntryId);
  }
  if (row.recipeRunId !== null) {
    throw new PlanEntryHasCookEvent(planEntryId, row.recipeRunId);
  }
  db.delete(planEntries).where(eq(planEntries.id, planEntryId)).run();
}

/**
 * Assign positions 0..n-1 to the given ids in order. Caller is responsible
 * for passing ids that all belong to the same (date, slot). The reorder is
 * done in one transaction so partial reorders never escape.
 */
export function reorderSlot(db: FoodDb, orderedIds: readonly number[]): void {
  if (orderedIds.length === 0) return;
  db.transaction((tx) => {
    orderedIds.forEach((id, position) => {
      tx.update(planEntries).set({ position }).where(eq(planEntries.id, id)).run();
    });
  });
}

export interface AddSlotInput {
  slug: string;
  name: string;
  displayOrder?: number;
}

export function addSlot(db: FoodDb, input: AddSlotInput): PlanSlotRow {
  assertValidSlug(input.slug);
  const existing = db
    .select({ slug: planSlots.slug })
    .from(planSlots)
    .where(eq(planSlots.slug, input.slug))
    .all();
  if (existing.length > 0) {
    throw new PlanSlotSlugAlreadyExists(input.slug);
  }
  const rows = db
    .insert(planSlots)
    .values({
      slug: input.slug,
      name: input.name,
      displayOrder: input.displayOrder ?? 100,
      isDefault: 0,
    })
    .returning()
    .all();
  return expectRow(rows, `addSlot(${input.slug})`);
}

/** Backward-compat alias for `addSlot`. */
export const addCustomSlot = addSlot;

export interface UpdateSlotInput {
  name?: string;
  displayOrder?: number;
}

export function updateSlot(db: FoodDb, slug: string, patch: UpdateSlotInput): PlanSlotRow {
  if (patch.name === undefined && patch.displayOrder === undefined) {
    const current = db.select().from(planSlots).where(eq(planSlots.slug, slug)).all();
    const row = current[0];
    if (row === undefined) {
      throw new PlanSlotNotFound(slug);
    }
    return row;
  }
  const updates: Partial<PlanSlotRow> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.displayOrder !== undefined) updates.displayOrder = patch.displayOrder;
  const rows = db.update(planSlots).set(updates).where(eq(planSlots.slug, slug)).returning().all();
  const row = rows[0];
  if (row === undefined) {
    throw new PlanSlotNotFound(slug);
  }
  return row;
}

export function deleteSlot(db: FoodDb, slug: string): void {
  const existing = db
    .select({ slug: planSlots.slug, isDefault: planSlots.isDefault })
    .from(planSlots)
    .where(eq(planSlots.slug, slug))
    .all();
  const row = existing[0];
  if (row === undefined) {
    throw new PlanSlotNotFound(slug);
  }
  if (row.isDefault === 1) {
    throw new PlanSlotIsDefault(slug);
  }
  const usage = db
    .select({ count: sql<number>`count(*)` })
    .from(planEntries)
    .where(eq(planEntries.slot, slug))
    .all();
  const inUse = usage[0]?.count ?? 0;
  if (inUse > 0) {
    throw new PlanSlotInUse(slug, inUse);
  }
  db.delete(planSlots).where(eq(planSlots.slug, slug)).run();
}

/** List slots in display order; slug breaks ties. */
export function listSlots(db: FoodDb): PlanSlotRow[] {
  return db
    .select()
    .from(planSlots)
    .orderBy(asc(planSlots.displayOrder), asc(planSlots.slug))
    .all();
}
