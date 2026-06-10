/**
 * `food.shopping.generateFromPlan` — PRD-152.
 *
 * Re-runs the preview server-side (single source of truth — the client's
 * computed view never lands at the persistence boundary) then writes a new
 * shopping list inside one Drizzle transaction. Items are emitted with
 * explicit `position` values so PRD-140's flat list shows them in
 * section-then-name order without a follow-up `lists.items.reorder` call.
 */
import { bulkAdd, createList } from '@pops/app-lists-db';

import { buildItemNotes } from './list-name.js';
import { previewFromPlan } from './preview.js';
import { type GenerateResult, type GeneratorItem } from './types.js';

import type { FoodDb } from '@pops/app-food-db';

export interface GenerateInput {
  startDate: string;
  endDate: string;
  listName: string;
}

interface PreparedItem {
  label: string;
  qty: number;
  unit: string;
  refKind: 'ingredient' | 'variant';
  refId: number;
  notes: string;
  position: number;
}

export function generateFromPlan(db: FoodDb, input: GenerateInput): GenerateResult {
  const name = input.listName.trim();
  if (name.length === 0) return { ok: false, reason: 'ListNameEmpty' };

  const previewResult = previewFromPlan(db, {
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!previewResult.ok) return { ok: false, reason: previewResult.reason };
  const { preview } = previewResult;

  const writableItems = collectWritableItems(preview.sections.flatMap((s) => s.items));
  if (writableItems.length === 0) return { ok: false, reason: 'NoPlanEntries' };

  const notes = buildItemNotes(input.startDate, input.endDate, preview.recipeTitles);
  const prepared = writableItems.map((item, idx) => buildPreparedItem(item, idx, notes));

  return runWrite(db, name, prepared);
}

function runWrite(db: FoodDb, listName: string, prepared: readonly PreparedItem[]): GenerateResult {
  try {
    return db.transaction((tx) => {
      const list = createList(tx, { name: listName, kind: 'shopping', ownerApp: 'food' });
      bulkAdd(tx, list.id, prepared);
      return { ok: true, listId: list.id, itemCount: prepared.length };
    });
  } catch {
    return { ok: false, reason: 'BulkAddFailed' };
  }
}

function collectWritableItems(items: readonly GeneratorItem[]): GeneratorItem[] {
  return items.filter((i) => i.isUnconverted || i.buyQty > 0);
}

function buildPreparedItem(item: GeneratorItem, position: number, notes: string): PreparedItem {
  const qty = item.isUnconverted ? (item.originalQty ?? 0) : item.buyQty;
  const unit = item.isUnconverted ? (item.originalUnit ?? '') : item.canonicalUnit;
  const refKind: 'ingredient' | 'variant' = item.variantId === null ? 'ingredient' : 'variant';
  const refId = item.variantId ?? item.ingredientId;
  return {
    label: buildLabel(item, qty, unit),
    qty,
    unit,
    refKind,
    refId,
    notes,
    position,
  };
}

function buildLabel(item: GeneratorItem, qty: number, unit: string): string {
  const variantSuffix = item.variantName === null ? '' : ` ${item.variantName}`;
  const qtyStr = formatQty(qty);
  return `${qtyStr} ${unit} ${item.ingredientName}${variantSuffix}`;
}

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  // Mirror PRD-142's `formatQty` — trailing-zero strip, no thousands.
  return Number(qty.toFixed(2))
    .toString()
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}
