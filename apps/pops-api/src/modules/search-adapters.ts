/**
 * Search adapter aggregator (PRD-101 US-06).
 *
 * Replaces the deleted runtime `searchAdapterRegistry` + side-effect
 * `registerSearchAdapter()` calls with a build-time consumer that joins each
 * module's declared `search` slot to the `MODULES` install set from
 * `@pops/module-registry`.
 *
 * Lives under `apps/pops-api/src/modules/` (one level above any individual
 * module) so it can legitimately import every module's adapter under the
 * import-boundary rules (PRD-097): per-module dirs are restricted from
 * cross-module imports, but this aggregator is shared infrastructure.
 *
 * Adapter values are imported directly from each module's adapter file
 * rather than via `manifest.search` to avoid a circular load chain: each
 * module's `index.ts` (which exports the manifest) pulls in the entire
 * backend router graph including `core/search/router.ts` → `engine.ts` →
 * this aggregator. Importing the adapter files directly side-steps the
 * cycle while the manifest stays the canonical declaration site
 * (cross-checked by `manifests.test.ts`).
 */
import { isInstalledModule } from '@pops/module-registry';

import { entitiesSearchAdapter } from './core/entities/search-adapter.js';
import { budgetsSearchAdapter } from './finance/budgets/search-adapter.js';
import { transactionsSearchAdapter } from './finance/transactions/search-adapter.js';
import { wishlistSearchAdapter } from './finance/wishlist/search-adapter.js';
import { inventoryItemsSearchAdapter } from './inventory/items/search-adapter.js';
import { moviesSearchAdapter } from './media/search/movies-adapter.js';
import { tvShowsSearchAdapter } from './media/search/tv-shows-adapter.js';

import type { SearchAdapter } from './core/search/types.js';

/** A search adapter joined to the id of the module that declared it. */
export interface OwnedAdapter {
  readonly moduleId: string;
  readonly adapter: SearchAdapter;
}

/**
 * Static binding from owning module id to adapter list. Each entry must
 * match the corresponding module manifest's `search` slot —
 * `manifests.test.ts` is the cross-check.
 *
 * `core` is always installed (PRD-100); domain modules are gated against
 * the runtime `INSTALLED_MODULES` shim (PRD-218 US-01) in
 * `getOwnedAdapters` so per-deploy `POPS_APPS` narrowing wins.
 */
const ADAPTER_BINDINGS: readonly { moduleId: string; adapters: readonly SearchAdapter[] }[] = [
  { moduleId: 'core', adapters: [entitiesSearchAdapter] },
  {
    moduleId: 'finance',
    adapters: [transactionsSearchAdapter, budgetsSearchAdapter, wishlistSearchAdapter],
  },
  { moduleId: 'inventory', adapters: [inventoryItemsSearchAdapter] },
  { moduleId: 'media', adapters: [moviesSearchAdapter, tvShowsSearchAdapter] },
];

/**
 * Aggregate every installed module's declared search adapters. Equivalent to
 * `MODULES.flatMap(m => (m.search ?? []).map(a => ({ moduleId: m.id, adapter: a })))`
 * — except the build-time `MODULES` constant carries metadata only, so this
 * helper joins the static adapter bindings to the install set.
 *
 * Filters out modules whose id is not in `INSTALLED_MODULES` so a deploy
 * with `POPS_APPS=finance` never fans out to media or inventory adapters.
 * `core` is always installed and always passes the gate (it's also
 * always present in `INSTALLED_MODULES`, but the explicit short-circuit
 * documents the contract).
 */
export function getOwnedAdapters(): readonly OwnedAdapter[] {
  const owned: OwnedAdapter[] = [];
  for (const { moduleId, adapters } of ADAPTER_BINDINGS) {
    if (moduleId !== 'core' && !isInstalledModule(moduleId)) continue;
    for (const adapter of adapters) {
      owned.push({ moduleId, adapter });
    }
  }
  return owned;
}
