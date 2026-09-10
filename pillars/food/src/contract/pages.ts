/**
 * The pillar's page surface: one entry per route the app mounts, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it onto
 * `ManifestPayload.pages` for the registry; `@pops/app-food` resolves the slot
 * to the component its route table already mounts.
 *
 * **Every route, not only the rail-reachable ones.** The shell mounts
 * exactly the pages listed here and nothing else — so a route missing from
 * this list does not exist (POPS-3222). Most of food's routes are
 * detail and edit pages reached from a list rather than from the rail, which
 * is precisely why they are easy to leave out and hard to notice missing.
 *
 * The `data` tabs are `children` of the layout that renders their chrome,
 * mirroring `routes.tsx`. They were flattened here before POPS-3256, against
 * a comment saying the shell would "reconstruct the parent/child mounting" —
 * which nothing did, and which flattening cannot support anyway: the layout
 * would remount on every tab switch and lose its state. The slot names are
 * unchanged from that list, so this is a nesting change and not a rename.
 */
export const FOOD_PAGES = [
  { path: '', index: true, bundleSlot: 'food-landing' },
  {
    path: 'data',
    bundleSlot: 'food-data-layout',
    children: [
      { path: '', index: true, bundleSlot: 'food-data-index' },
      { path: 'ingredients', bundleSlot: 'food-data-ingredients' },
      { path: 'aliases', bundleSlot: 'food-data-aliases' },
      { path: 'prep-states', bundleSlot: 'food-data-prep-states' },
      { path: 'substitutions', bundleSlot: 'food-data-substitutions' },
      { path: 'substitutions/graph', bundleSlot: 'food-data-substitutions-graph' },
      { path: 'conversions', bundleSlot: 'food-data-conversions' },
      { path: 'tags', bundleSlot: 'food-data-tags' },
    ],
  },
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
] as const;

/**
 * Every bundle slot the food UI must supply a component for, the nested ones
 * included. A remote bundle exporting anything other than exactly these keys
 * is a contract break the shell's loader reports as a missing slot at first
 * navigation.
 */
type SlotsOf<T> = T extends { readonly bundleSlot: infer S }
  ? T extends { readonly children: readonly (infer C)[] }
    ? S | SlotsOf<C>
    : S
  : never;

export type FoodPageSlot = SlotsOf<(typeof FOOD_PAGES)[number]>;
