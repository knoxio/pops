/**
 * Tab metadata for the `/food/data` page (PRD-122).
 *
 * Drives the desktop tab strip and the mobile dropdown. The routes file
 * (`packages/app-food/src/routes.tsx`) declares each child route directly
 * — keep the two lists aligned by hand when a tab is added or removed.
 * Each entry's `slug` is the URL segment (`/food/data/<slug>`) and the
 * matching i18n key under the `food` namespace.
 *
 * Tab ownership:
 *   - ingredients/aliases/prep-states/substitutions — PRD-122 (this page)
 *   - conversions — placeholder; PRD-123 owns the contents
 */
export interface FoodDataTab {
  slug: 'ingredients' | 'aliases' | 'prep-states' | 'substitutions' | 'conversions';
  labelKey: string;
}

export const FOOD_DATA_TABS: readonly FoodDataTab[] = [
  { slug: 'ingredients', labelKey: 'data.tabs.ingredients' },
  { slug: 'aliases', labelKey: 'data.tabs.aliases' },
  { slug: 'prep-states', labelKey: 'data.tabs.prepStates' },
  { slug: 'substitutions', labelKey: 'data.tabs.substitutions' },
  { slug: 'conversions', labelKey: 'data.tabs.conversions' },
];

export const DEFAULT_TAB_SLUG: FoodDataTab['slug'] = 'ingredients';
