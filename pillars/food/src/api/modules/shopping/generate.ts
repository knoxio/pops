/**
 * `food.shopping.generateFromPlan` — PRD-152, rewired onto the lists REST
 * API. Re-runs the preview server-side (single source of truth) then writes
 * a new shopping list over HTTP: create the list, then add each item in
 * section-then-name order (the lists pillar auto-assigns sequential
 * positions, so insertion order = display order). No cross-pillar
 * transaction — a failure mid-write leaves a partial list (lists owns its
 * own consistency).
 */
import { type ListsClient } from '../recipes/send-to-list/lists-client.js';
import { buildItemNotes } from './list-name.js';
import { previewFromPlan } from './preview.js';
import { type GenerateResult, type GeneratorItem } from './types.js';

import type { FoodDb } from '../../../db/index.js';

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
}

export async function generateFromPlan(
  db: FoodDb,
  client: ListsClient,
  input: GenerateInput
): Promise<GenerateResult> {
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
  const prepared = writableItems.map((item) => buildPreparedItem(item, notes));

  return runWrite(client, name, prepared);
}

async function runWrite(
  client: ListsClient,
  listName: string,
  prepared: readonly PreparedItem[]
): Promise<GenerateResult> {
  try {
    const listId = await client.createShoppingList(listName);
    for (const item of prepared) {
      await client.addItem(listId, {
        label: item.label,
        qty: item.qty,
        unit: item.unit,
        refKind: item.refKind,
        refId: item.refId,
        notes: item.notes,
      });
    }
    return { ok: true, listId, itemCount: prepared.length };
  } catch {
    return { ok: false, reason: 'BulkAddFailed' };
  }
}

function collectWritableItems(items: readonly GeneratorItem[]): GeneratorItem[] {
  return items.filter((i) => i.isUnconverted || i.buyQty > 0);
}

function buildPreparedItem(item: GeneratorItem, notes: string): PreparedItem {
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
