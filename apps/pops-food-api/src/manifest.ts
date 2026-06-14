import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const FOOD_PILLAR_ID = 'food' as const;

/**
 * Wire-format nav contribution for the food pillar (PRD-243 US-02).
 *
 * Mirrors `@pops/app-food`'s `navConfig` (`packages/app-food/src/routes.tsx`)
 * field-for-field; Lucide names are rewritten as kebab-case identifiers
 * per the wire schema from PR #3230. `order: 40` matches today's
 * position in `apps/pops-shell/src/app/nav/registry.ts`
 * (`registeredApps[3]`).
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
 * Wire-format pages contribution for the food pillar (PRD-243 US-02).
 *
 * One descriptor per route declared in `@pops/app-food`'s `routes`
 * array. The nested `/food/data/*` subtree is flattened: each child
 * becomes its own descriptor carrying the full `data/<tab>` path. The
 * `FoodDataLayout` wrapper is carried as `food-data-layout` against the
 * bare `data` path so the shell-side bundle map (PRD-243 US-03) can
 * reconstruct the parent/child mounting today's nested
 * `RouteObject.children` shape gives us.
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
 * Food pillar manifest payload.
 *
 * Extracted out of `server.ts` in PRD-243 US-02 so the `nav` + `pages`
 * UI dimensions PR #3230 introduces have a dedicated home alongside
 * `buildCerebrumManifest` / `buildMediaManifest`.
 *
 * Drive-by fix: server.ts pinned the contract package as
 * `@pops/food-contracts` (plural), which `ManifestPayloadSchema`'s
 * `CONTRACT_PACKAGE` regex rejects (`^@pops\/[a-z-]+-contract$`). The
 * value was never validated before because `buildFoodManifest` had no
 * test coverage. The singular `@pops/food-contract` package exists at
 * `packages/food-contract/` (see PRD-241 US-01 in #3229) and is the
 * canonical contract package today — pinning the manifest there fixes
 * the wire format AND aligns with the contract export landed in #3229.
 */
export function buildFoodManifest(version: string): ManifestPayload {
  return {
    pillar: FOOD_PILLAR_ID,
    version,
    contract: {
      package: '@pops/food-contract',
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
