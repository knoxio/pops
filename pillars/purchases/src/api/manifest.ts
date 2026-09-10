import { PURCHASES_PAGES as CONTRACT_PAGES } from '../contract/pages.js';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const PURCHASES_PILLAR_ID = 'purchases' as const;

/**
 * Wire-format nav contribution for the purchases pillar.
 *
 * Carries one item per entry in the app's `navConfig`
 * (`pillars/purchases/app/src/routes.tsx`), in the same order and with the
 * same paths and label keys. Two fields have no counterpart there rather than
 * a matching one: `order`, which the app's config does not carry at all — the
 * rail position is a wire property, read from here — and `icon`, which names
 * the same Lucide
 * glyphs in the kebab-case the wire schema requires rather than the
 * PascalCase the app spells them in.
 *
 * `order` sits between finance (10) and media (20) rather than at the end of
 * the rail. Purchases exists to reconcile against finance transactions and
 * the operator crosses between the two constantly, so the two belong
 * adjacent; the sparse scheme's gaps are what make placing a pillar at its
 * semantic position possible without renumbering everything after it.
 */
const PURCHASES_NAV: NavConfigDescriptor = {
  id: 'purchases',
  label: 'Purchases',
  labelKey: 'purchases',
  icon: 'receipt',
  color: 'rose',
  basePath: '/purchases',
  order: 15,
  items: [
    { path: '', label: 'Reconcile', labelKey: 'purchases.reconcile', icon: 'receipt' },
    { path: '/merchants', label: 'Merchants', labelKey: 'purchases.merchants', icon: 'building-2' },
    { path: '/receipts', label: 'Receipts', labelKey: 'purchases.receipts', icon: 'file-text' },
    { path: '/products', label: 'Products', labelKey: 'purchases.products', icon: 'package' },
  ],
};

/**
 * Where the shell's runtime loader fetches this pillar's UI bundle from.
 *
 * Root-relative rather than absolute: the same deployment is reached by LAN
 * name, Tailscale name and `localhost`, so no absolute origin written here
 * would be right on all of them. The path is served by the shell's own nginx
 * (`pillars/shell/nginx.conf`), which keeps the module request same-origin —
 * that is what makes the shell's shared-runtime import map apply to it, with
 * no CORS posture to get wrong.
 *
 * The filename is stable because it is half of this URL and the registry
 * advertises it; the hashed chunks it pulls in beside itself are what carry
 * cache correctness. `pillars/purchases/app/vite.remote.config.ts` emits both.
 */
const PURCHASES_ASSETS_BASE_URL = '/purchases-ui/purchases.js';

/**
 * Wire-format pages contribution for the purchases pillar.
 *
 * Projected from the contract's `PURCHASES_PAGES` rather than restated here:
 * `@pops/app-purchases` binds a component to each of those same slots, and a
 * second copy of the pairing is free to name a different page than the bundle
 * does. The `satisfies` is the conformance check — this is the only place that
 * needs the SDK's `PageDescriptor`, so it is the only place that imports it.
 *
 * One descriptor per route declared in the app's `routes` array
 * (`pillars/purchases/app/src/routes.tsx`) that the rail can reach — the
 * order-detail route takes a `:purchaseId` no rail entry can supply, so it
 * has no nav item and no page descriptor here, the same reasoning
 * `pillars/purchases/app/src/routes.tsx` documents for leaving it off
 * `navConfig`.
 */
const PURCHASES_PAGES = [...CONTRACT_PAGES] as const satisfies readonly PageDescriptor[];

/**
 * The manifest's search-adapter shape, derived from the payload type rather
 * than restated: the SDK's `manifest-schema` barrel does not export it, and a
 * hand-written copy would be free to drift from the zod schema that actually
 * validates this.
 */
type SearchAdapterDescriptor = ManifestPayload['search']['adapters'][number];

/**
 * Free text only, on both adapters.
 *
 * `supportsDateRange` is false because `POST /search` takes a query and a
 * context and nothing else — the order index has `from`/`to` but the search
 * envelope does not carry them through, and advertising a filter the handler
 * ignores is worse than not advertising it. `supportsTags` is false for the
 * same reason: item tags are searchable through `GET /items?tag=`, which is
 * a different route with a closed vocabulary, not this one.
 */
const TEXT_ONLY_QUERY_SHAPE = {
  supportsText: true,
  supportsTags: false,
  supportsDateRange: false,
  supportsScope: [],
} as const satisfies SearchAdapterDescriptor['queryShape'];

/**
 * Two adapters, one procedure. A pillar's `/search` returns a single flat
 * ranked list and the federator decorates at pillar granularity, so the split
 * here describes what the pillar searches, not how many endpoints it serves —
 * the same arrangement finance uses for its three.
 */
const PURCHASES_SEARCH_ADAPTERS: readonly SearchAdapterDescriptor[] = [
  {
    name: 'orders',
    entityType: 'purchase',
    queryShape: TEXT_ONLY_QUERY_SHAPE,
    procedurePath: 'purchases.search.search',
  },
  {
    name: 'lineItems',
    entityType: 'purchase-item',
    queryShape: TEXT_ONLY_QUERY_SHAPE,
    procedurePath: 'purchases.search.search',
  },
];

/**
 * The `<pillar>/<entity>` pairs a purchases hit can address.
 *
 * Derived from the adapters rather than restated beside them: the URIs
 * `src/db/services/search.ts` emits are built from the same entity types, so a
 * new adapter cannot ship a URI shape this manifest never declared.
 */
const PURCHASES_URI_TYPES: readonly string[] = PURCHASES_SEARCH_ADAPTERS.map(
  (adapter) => `${PURCHASES_PILLAR_ID}/${adapter.entityType}`
);

/**
 * Purchases pillar manifest payload.
 *
 * `nav` and `pages` were empty until this pillar had a frontend, because a
 * rail entry pointing at a bundle slot that does not exist is a dead link.
 * `pillars/purchases/app` is that slot, so both dimensions are declared now
 * — one nav item and one page descriptor per rail-reachable route the app
 * mounts (`pillars/purchases/app/src/routes.tsx`).
 *
 * `search.adapters` was never held back on that reasoning, though it used to
 * be justified by it. A search adapter is a backend seam — the orchestrator
 * POSTs `{ query, context }` to the pillar's own `/search` over the pillar SDK
 * and never touches a bundle — so the only thing declaring one requires is
 * that the route exists. It does (`src/contract/rest-search.ts`).
 *
 * `routes.queries` carries that one path because the manifest validator
 * refuses a search adapter whose `procedurePath` no declared route backs
 * (`checkSearchAdapterProceduresAreDeclared`). It is not an inventory of the
 * pillar's routes and does not claim to be one.
 *
 * `ai.tools` stays empty, and that is a different decision from the one
 * above rather than the same one twice: this slot is the pillar hosting tool
 * *definitions* for the orchestrator's AI tool-router to project. The
 * pillar's assistant reach is served instead by MCP tool modules in
 * `pillars/mcp/src/tools/purchases.ts`, which call these routes over the SDK
 * — the same arrangement finance, inventory, media and cerebrum have, none
 * of which declare `ai.tools` either.
 *
 * `uri.types` names both types the search adapters emit. It was empty while
 * nothing could resolve them; `pillars/purchases/app` now mounts an order
 * detail route and `libs/navigation`'s `URI_ROUTE_MAP` carries both prefixes,
 * so the claim is backed. A line resolves to the order it was bought on —
 * ADR-012 keeps the id segment one row's primary key, so the order id travels
 * in the hit's `data` rather than in the URI — and the pillar still emits the
 * line's own identity, because a hit that named its order would be
 * indistinguishable from the order's own hit.
 */
export function buildPurchasesManifest(version: string): ManifestPayload {
  return {
    pillar: PURCHASES_PILLAR_ID,
    version,
    contract: {
      package: '@pops/purchases',
      version,
      tag: `contract-purchases@v${version}`,
    },
    routes: { queries: ['purchases.search.search'], mutations: [], subscriptions: [] },
    search: { adapters: [...PURCHASES_SEARCH_ADAPTERS] },
    ai: { tools: [] },
    uri: { types: [...PURCHASES_URI_TYPES] },
    consumedSettings: { keys: [] },
    nav: PURCHASES_NAV,
    pages: [...PURCHASES_PAGES],
    assetsBaseUrl: PURCHASES_ASSETS_BASE_URL,
    healthcheck: { path: '/health' },
  };
}
