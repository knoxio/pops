/**
 * Tab metadata for `/food/data`. Drives the desktop tab strip and the
 * mobile dropdown. The routes file declares each child route directly —
 * keep the two lists aligned by hand when a tab is added or removed.
 * Each `slug` is the URL segment (`/food/data/<slug>`) and the matching
 * i18n key under the `food` namespace.
 */
export interface FoodDataTab {
  slug: 'ingredients' | 'aliases' | 'prep-states' | 'substitutions' | 'conversions' | 'tags';
  labelKey: string;
}

export const FOOD_DATA_TABS: readonly FoodDataTab[] = [
  { slug: 'ingredients', labelKey: 'data.tabs.ingredients' },
  { slug: 'aliases', labelKey: 'data.tabs.aliases' },
  { slug: 'prep-states', labelKey: 'data.tabs.prepStates' },
  { slug: 'substitutions', labelKey: 'data.tabs.substitutions' },
  { slug: 'conversions', labelKey: 'data.tabs.conversions' },
  // Read-only vocabulary view; per-ingredient editing lives on the
  // Ingredients tab's detail panel.
  { slug: 'tags', labelKey: 'data.tabs.tags' },
];

export const DEFAULT_TAB_SLUG: FoodDataTab['slug'] = 'ingredients';
