/**
 * The pillar's page surface: one entry per route the app mounts, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it onto
 * `ManifestPayload.pages` for the registry; `@pops/app-bfm` resolves the slot
 * to the component its route table already mounts.
 *
 * **Every route, not only the rail-reachable ones.** The shell mounts
 * exactly the pages listed here and nothing else — so a route missing from
 * this list does not exist (POPS-3221).
 */
export const BFM_PAGES = [{ path: '', index: true, bundleSlot: 'bfm-devices' }] as const;

/**
 * Every bundle slot the bfm UI must supply a component for. A remote bundle
 * exporting anything other than exactly these keys is a contract break the
 * shell's loader reports as a missing slot at first navigation.
 */
export type BfmPageSlot = (typeof BFM_PAGES)[number]['bundleSlot'];
