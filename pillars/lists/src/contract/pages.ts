/**
 * The pillar's page surface: one entry per route the app mounts, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it onto
 * `ManifestPayload.pages` for the registry; `@pops/app-lists` resolves the
 * slot to the component its route table already mounts.
 *
 * **Every route, not only the rail-reachable ones.** The shell mounts
 * exactly the pages listed here and nothing else — so a route missing from
 * this list does not exist (POPS-3224). `:id` is the detail page, which
 * is a deep link and has no sidebar entry to look broken if it went missing.
 */
export const LISTS_PAGES = [
  { path: '', index: true, bundleSlot: 'lists-index' },
  { path: ':id', bundleSlot: 'lists-detail' },
] as const;

/**
 * Every bundle slot the lists UI must supply a component for. A remote bundle
 * exporting anything other than exactly these keys is a contract break the
 * shell's loader reports as a missing slot at first navigation.
 */
export type ListsPageSlot = (typeof LISTS_PAGES)[number]['bundleSlot'];
