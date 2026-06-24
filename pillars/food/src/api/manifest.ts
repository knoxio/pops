import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const FOOD_PILLAR_ID = 'food' as const;

/**
 * Wire-format nav contribution for the food pillar.
 *
 * Mirrors the `navConfig` in `pillars/food/app/src/routes.tsx`
 * field-for-field; Lucide icon names are kebab-case identifiers per the
 * wire schema. The shell orders apps by `order`.
 */
const FOOD_NAV: NavConfigDescriptor = {
  id: 'food',
  label: 'Food',
  labelKey: 'food',
  icon: 'utensils',
  color: 'amber',
  basePath: '/food',
  order: 40,
  items: [
    { path: '', label: 'Home', labelKey: 'food.home', icon: 'layout-dashboard' },
    { path: '/recipes', label: 'Recipes', labelKey: 'food.recipes', icon: 'book-open' },
    { path: '/inbox', label: 'Inbox', labelKey: 'food.inbox', icon: 'bell' },
    { path: '/plan', label: 'Plan', labelKey: 'food.plan', icon: 'clock' },
    { path: '/fridge', label: 'Fridge', labelKey: 'food.fridge', icon: 'package' },
    { path: '/solve', label: 'Solve', labelKey: 'food.solve', icon: 'compass' },
    {
      path: '/shopping/from-plan',
      label: 'Shopping',
      labelKey: 'food.shopping',
      icon: 'list-checks',
    },
    { path: '/data', label: 'Manage data', labelKey: 'food.data', icon: 'database' },
    { path: '/prompts', label: 'Prompts', labelKey: 'food.prompts', icon: 'file-text' },
  ],
};

/**
 * Wire-format pages contribution for the food pillar.
 *
 * One descriptor per route declared in `pillars/food/app/src/routes.tsx`.
 * The nested `/food/data/*` subtree is flattened: each child becomes its
 * own descriptor carrying the full `data/<tab>` path. The `FoodDataLayout`
 * wrapper is carried as `food-data-layout` against the bare `data` path so
 * the shell-side bundle map can reconstruct the parent/child mounting that
 * the nested `RouteObject.children` shape gives us.
 */
const FOOD_PAGES: readonly PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'food-landing' },
  { path: 'data', bundleSlot: 'food-data-layout' },
  { path: 'data/ingredients', bundleSlot: 'food-data-ingredients' },
  { path: 'data/aliases', bundleSlot: 'food-data-aliases' },
  { path: 'data/prep-states', bundleSlot: 'food-data-prep-states' },
  { path: 'data/substitutions', bundleSlot: 'food-data-substitutions' },
  { path: 'data/substitutions/graph', bundleSlot: 'food-data-substitutions-graph' },
  { path: 'data/conversions', bundleSlot: 'food-data-conversions' },
  { path: 'data/tags', bundleSlot: 'food-data-tags' },
  { path: 'recipes', bundleSlot: 'food-recipe-list' },
  { path: 'recipes/new', bundleSlot: 'food-recipe-new' },
  { path: 'recipes/:slug', bundleSlot: 'food-recipe-detail' },
  { path: 'recipes/:slug/v/:versionNo', bundleSlot: 'food-recipe-version-detail' },
  { path: 'recipes/:slug/edit', bundleSlot: 'food-recipe-edit' },
  { path: 'recipes/:slug/drafts', bundleSlot: 'food-recipe-drafts' },
  { path: 'recipes/:slug/drafts/:draftNo', bundleSlot: 'food-recipe-draft-edit' },
  { path: 'prompts', bundleSlot: 'food-prompt-viewer' },
  { path: 'plan', bundleSlot: 'food-plan' },
  { path: 'fridge', bundleSlot: 'food-fridge' },
  { path: 'solve', bundleSlot: 'food-solve' },
  { path: 'shopping/from-plan', bundleSlot: 'food-shopping-from-plan' },
  { path: 'inbox', bundleSlot: 'food-inbox' },
  { path: 'inbox/:sourceId', bundleSlot: 'food-inbox-inspector' },
];

/**
 * Builds the food pillar manifest payload sent to the registry on boot.
 */
export function buildFoodManifest(version: string): ManifestPayload {
  return {
    pillar: FOOD_PILLAR_ID,
    version,
    contract: {
      package: '@pops/food',
      version,
      tag: `contract-food@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    nav: FOOD_NAV,
    pages: [...FOOD_PAGES],
    healthcheck: { path: '/health' },
  };
}
