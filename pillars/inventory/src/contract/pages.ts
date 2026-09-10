/**
 * The pillar's page surface: one entry per route the app mounts, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it onto
 * `ManifestPayload.pages` for the registry; `@pops/app-inventory` resolves the
 * slot to the component its route table already mounts.
 *
 * **Every route, not only the rail-reachable ones.** The shell mounts
 * exactly the pages listed here and nothing else — so a route missing from
 * this list does not exist (POPS-3223). The two `report/*` redirects were
 * missing from the list this replaces: harmless while the bundle map mounted
 * the whole route table, and a 404 on an old bookmark the moment it did not.
 *
 * Two shapes worth noting:
 *
 *   - the `reports` group is `children` of a parent, mirroring `routes.tsx`.
 *     That parent has no element in the app — react-router allows a route with
 *     children and none — but the wire requires a slot per node, so the app
 *     names a passthrough that renders `<Outlet/>`, which is what react-router
 *     does implicitly. Both mount paths use the same component, so they cannot
 *     disagree;
 *   - `items/new` and `items/:id/edit` share `inventory-item-form`. A slot maps
 *     to one component; two paths may name the same slot.
 */
export const INVENTORY_PAGES = [
  { path: '', index: true, bundleSlot: 'inventory-items' },
  { path: 'items/new', bundleSlot: 'inventory-item-form' },
  { path: 'items/:id', bundleSlot: 'inventory-item-detail' },
  { path: 'items/:id/edit', bundleSlot: 'inventory-item-form' },
  { path: 'connections', bundleSlot: 'inventory-connections' },
  { path: 'warranties', bundleSlot: 'inventory-warranties' },
  { path: 'locations', bundleSlot: 'inventory-location-tree' },
  {
    path: 'reports',
    bundleSlot: 'inventory-reports-group',
    children: [
      { path: '', index: true, bundleSlot: 'inventory-report-dashboard' },
      { path: 'insurance', bundleSlot: 'inventory-insurance-report' },
    ],
  },
  { path: 'report', bundleSlot: 'inventory-report-redirect' },
  { path: 'report/insurance', bundleSlot: 'inventory-insurance-report-redirect' },
] as const;

/**
 * Every bundle slot the inventory UI must supply a component for, the nested
 * ones included. A remote bundle exporting anything other than exactly these
 * keys is a contract break the shell's loader reports as a missing slot at
 * first navigation.
 */
type SlotsOf<T> = T extends { readonly bundleSlot: infer S }
  ? T extends { readonly children: readonly (infer C)[] }
    ? S | SlotsOf<C>
    : S
  : never;

export type InventoryPageSlot = SlotsOf<(typeof INVENTORY_PAGES)[number]>;
