/**
 * Plan-slot mutation logic (add / update / delete) returning discriminated
 * `{ ok, ... }` results; the REST handler wraps each result in a 200 envelope.
 */
import {
  type FoodDb,
  InvalidSlugError,
  planService,
  PlanSlotInUse,
  PlanSlotIsDefault,
  PlanSlotNotFound,
  PlanSlotSlugAlreadyExists,
} from '../../../db/index.js';
import { listWireSlots } from './week-view.js';

import type {
  PlanSlotDeleteResult,
  PlanSlotMutationResult,
  PlanSlotUpdateResult,
} from '../../../domain/types/plan.js';

export function addSlotResult(db: FoodDb, slug: string, name: string): PlanSlotMutationResult {
  try {
    planService.addSlot(db, { slug, name });
    return { ok: true };
  } catch (err) {
    if (err instanceof PlanSlotSlugAlreadyExists) return { ok: false, reason: 'SlugTaken' };
    if (err instanceof InvalidSlugError) return { ok: false, reason: 'SlugInvalid' };
    throw err;
  }
}

export function updateSlotResult(
  db: FoodDb,
  slug: string,
  patch: { name?: string; displayOrder?: number }
): PlanSlotUpdateResult {
  const slot = listWireSlots(db).find((s) => s.slug === slug);
  if (slot === undefined) return { ok: false, reason: 'SlotNotFound' };
  if (slot.isDefault && patch.name !== undefined) return { ok: false, reason: 'CannotEditDefault' };
  try {
    planService.updateSlot(db, slug, { name: patch.name, displayOrder: patch.displayOrder });
    return { ok: true };
  } catch (err) {
    if (err instanceof PlanSlotNotFound) return { ok: false, reason: 'SlotNotFound' };
    throw err;
  }
}

export function deleteSlotResult(db: FoodDb, slug: string): PlanSlotDeleteResult {
  try {
    planService.deleteSlot(db, slug);
    return { ok: true };
  } catch (err) {
    if (err instanceof PlanSlotNotFound) return { ok: false, reason: 'SlotNotFound' };
    if (err instanceof PlanSlotIsDefault) return { ok: false, reason: 'CannotDeleteDefault' };
    if (err instanceof PlanSlotInUse) return { ok: false, reason: 'SlotInUse' };
    throw err;
  }
}
