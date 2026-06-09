/**
 * PRD-113 seed step — lists + list_items (PRD-112 + PRD-141).
 *
 * Uses app-lists services so ref_kind / ref_id normalisation flows through
 * the canonical code path. Items checked at fixture-time get an immediate
 * `checkItem` call so `checked_at` is populated, matching prod behaviour.
 */
import { type AddItemInput, addItem, checkItem } from '@pops/app-lists';
import { createList, type ListsDb } from '@pops/app-lists';

import { LIST_FIXTURES, type ListItemFixture } from './data-lists';

import type { SeedContext } from './types';

interface ResolvedRef {
  refKind: 'free' | 'ingredient' | 'variant';
  refId: number | null;
}

function resolveItemRef(item: ListItemFixture, ctx: SeedContext): ResolvedRef {
  if (item.refIngredientSlug !== undefined) {
    const id = ctx.ingredientIdBySlug.get(item.refIngredientSlug);
    if (id === undefined) {
      throw new Error(`List item refs unknown ingredient "${item.refIngredientSlug}"`);
    }
    return { refKind: 'ingredient', refId: id };
  }
  if (item.refVariantOfIngredient !== undefined && item.refVariantSlug !== undefined) {
    const key = `${item.refVariantOfIngredient}:${item.refVariantSlug}`;
    const id = ctx.variantIdByCompositeSlug.get(key);
    if (id === undefined) {
      throw new Error(`List item refs unknown variant "${key}"`);
    }
    return { refKind: 'variant', refId: id };
  }
  return { refKind: 'free', refId: null };
}

function toAddItemInput(item: ListItemFixture, listId: number, ctx: SeedContext): AddItemInput {
  const ref = resolveItemRef(item, ctx);
  return {
    listId,
    label: item.label,
    qty: item.qty ?? null,
    unit: item.unit ?? null,
    refKind: ref.refKind,
    refId: ref.refId,
    notes: item.notes ?? null,
  };
}

export function seedLists(
  db: ListsDb,
  ctx: SeedContext,
  foodCtx: SeedContext
): { lists: number; listItems: number } {
  // Both context handles point at the same maps; the second param mirrors the
  // food context so resolveItemRef can pull ingredient/variant ids that were
  // populated by earlier food steps. Kept explicit so the call site reads as
  // "lists DB + food context".
  let itemCount = 0;
  for (const fixture of LIST_FIXTURES) {
    const list = createList(db, {
      name: fixture.name,
      kind: fixture.kind,
      ownerApp: fixture.ownerApp,
    });
    ctx.listIdBySlug.set(fixture.slug, list.id);
    for (const item of fixture.items) {
      const inserted = addItem(db, toAddItemInput(item, list.id, foodCtx));
      if (item.checked === true) {
        checkItem(db, inserted.id);
      }
      itemCount += 1;
    }
  }
  return { lists: LIST_FIXTURES.length, listItems: itemCount };
}
