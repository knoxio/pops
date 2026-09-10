/**
 * The pillar's page surface: one entry per route the app mounts, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it onto
 * `ManifestPayload.pages` for the registry; `@pops/app-finance` resolves each
 * slot to the component its route table already mounts. Declared once, the two
 * cannot disagree about which page a slot names.
 *
 * **Every route, not only the rail-reachable ones.** The shell mounts
 * exactly the pages listed here and nothing else — so a route missing from
 * this list does not exist. Six of finance's fourteen were missing when it
 * moved (POPS-3219): the accounts surface, an entity's detail page, the tag
 * rules browser and settings. None is reached from the rail, so none would have
 * looked broken from the rail while all of them 404'd.
 *
 * "Rail-reachable" is therefore a property to read off a path rather than a
 * property of this list: a page whose path carries a `:` cannot be a nav item,
 * and one that could be and is not is a deliberate choice `nav` records.
 *
 * Deliberately free of `@pops/pillar-sdk` types — the app consumes this and has
 * no reason to depend on the manifest schema. `src/api/manifest.ts` is where
 * `PageDescriptor` conformance is asserted, beside the payload that satisfies
 * it.
 */

export const FINANCE_PAGES = [
  { path: '', index: true, bundleSlot: 'finance-dashboard' },
  { path: 'transactions', bundleSlot: 'finance-transactions' },
  { path: 'entities', bundleSlot: 'finance-entities' },
  { path: 'entities/:id', bundleSlot: 'finance-entity-detail' },
  { path: 'accounts', bundleSlot: 'finance-accounts' },
  { path: 'accounts/:id', bundleSlot: 'finance-account-detail' },
  { path: 'accounts/:id/checkpoints', bundleSlot: 'finance-account-checkpoints' },
  { path: 'budgets', bundleSlot: 'finance-budgets' },
  { path: 'wishlist', bundleSlot: 'finance-wishlist' },
  { path: 'import', bundleSlot: 'finance-import' },
  { path: 'rules', bundleSlot: 'finance-rules' },
  { path: 'tag-rules', bundleSlot: 'finance-tag-rules' },
  { path: 'prompts', bundleSlot: 'finance-prompts' },
  { path: 'settings', bundleSlot: 'finance-settings' },
] as const;

/**
 * Every bundle slot the finance UI must supply a component for. A remote
 * bundle exporting anything other than exactly these keys is a contract break
 * the shell's loader reports as a missing slot at first navigation.
 */
export type FinancePageSlot = (typeof FINANCE_PAGES)[number]['bundleSlot'];
