/**
 * PRD-113 fixture set — lists + items.
 *
 * Two lists owned by the food app (PRD-112 + PRD-141 shopping kind):
 *
 *   - "Weekly shopping" — `kind='shopping'`. Mix of `ref_kind=ingredient`
 *     rows (which Epic 04's send-to-list flow merges by `(ref_kind, ref_id)`)
 *     and free-text rows.
 *   - "Pantry restock" — `kind='generic'` with mixed checked/unchecked items
 *     so the UI has both states to render.
 */

export type ListKind = 'shopping' | 'generic';

export interface ListFixture {
  slug: string;
  name: string;
  kind: ListKind;
  ownerApp: 'food';
  items: readonly ListItemFixture[];
}

export interface ListItemFixture {
  label: string;
  /**
   * When set, the item is created with `ref_kind = ingredient | variant` and
   * the corresponding id; otherwise free-text.
   */
  refIngredientSlug?: string;
  refVariantOfIngredient?: string;
  refVariantSlug?: string;
  qty?: number;
  unit?: 'g' | 'ml' | 'count';
  checked?: boolean;
  notes?: string;
}

export const LIST_FIXTURES: readonly ListFixture[] = [
  {
    slug: 'weekly-shopping',
    name: 'Weekly shopping',
    kind: 'shopping',
    ownerApp: 'food',
    items: [
      {
        label: 'Olive oil — extra virgin',
        refVariantOfIngredient: 'olive-oil',
        refVariantSlug: 'extra-virgin',
        qty: 750,
        unit: 'ml',
      },
      {
        label: 'Burger buns',
        refVariantOfIngredient: 'bread',
        refVariantSlug: 'burger-bun',
        qty: 4,
        unit: 'count',
      },
      {
        label: 'Cheddar (shredded)',
        refVariantOfIngredient: 'cheese',
        refVariantSlug: 'cheddar-shredded',
        qty: 200,
        unit: 'g',
      },
      {
        label: 'Beef mince',
        refVariantOfIngredient: 'beef',
        refVariantSlug: 'mince',
        qty: 800,
        unit: 'g',
        notes: 'Smash burger',
      },
      {
        label: 'Loose leaf tea',
        // Free-text — no ingredient ref. Tests the unrefed code path.
        qty: 100,
        unit: 'g',
      },
    ],
  },
  {
    slug: 'pantry-restock',
    name: 'Pantry restock',
    kind: 'generic',
    ownerApp: 'food',
    items: [
      {
        label: 'Salt',
        refIngredientSlug: 'salt',
        qty: 500,
        unit: 'g',
        checked: true,
        notes: 'Restocked last week',
      },
      {
        label: 'Plain flour',
        refVariantOfIngredient: 'flour',
        refVariantSlug: 'plain',
        qty: 1000,
        unit: 'g',
      },
      {
        label: 'Brown sugar',
        refVariantOfIngredient: 'sugar',
        refVariantSlug: 'brown',
        qty: 500,
        unit: 'g',
      },
      {
        label: 'Black pepper',
        refVariantOfIngredient: 'pepper',
        refVariantSlug: 'black-ground',
        qty: 100,
        unit: 'g',
        checked: true,
      },
      {
        label: 'Sourdough starter feed',
        // Free-text again — exercises both checked + unchecked unrefed rows
        notes: 'Stone-milled rye',
      },
    ],
  },
];
