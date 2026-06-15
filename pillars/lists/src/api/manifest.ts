import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const LISTS_PILLAR_ID = 'lists' as const;

/**
 * Wire-format nav contribution for the lists pillar (PRD-243 US-02).
 *
 * Mirrors `@pops/app-lists`'s `navConfig` (`packages/app-lists/src/routes.tsx`)
 * field-for-field; Lucide names are rewritten as kebab-case identifiers
 * per the wire schema from PR #3230. `order: 50` matches today's
 * position in `apps/pops-shell/src/app/nav/registry.ts`
 * (`registeredApps[4]`). Detail pages (`/lists/:id`) intentionally stay
 * off the rail — they remain deep links, declared on the `pages`
 * dimension below.
 */
const LISTS_NAV: NavConfigDescriptor = {
  id: 'lists',
  label: 'Lists',
  labelKey: 'lists',
  icon: 'list-checks',
  color: 'sky',
  basePath: '/lists',
  order: 50,
  items: [{ path: '', label: 'Home', labelKey: 'lists.home', icon: 'layout-dashboard' }],
};

/**
 * Wire-format pages contribution for the lists pillar (PRD-243 US-02).
 *
 * One descriptor per route declared in `@pops/app-lists`'s `routes`
 * array — index (`ListsIndexPage`) and the `:id` detail page.
 */
const LISTS_PAGES: readonly PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'lists-index' },
  { path: ':id', bundleSlot: 'lists-detail' },
];

/**
 * Lists pillar manifest payload.
 *
 * Extracted out of `server.ts` in PRD-243 US-02 so the `nav` + `pages`
 * UI dimensions PR #3230 introduces have a dedicated home alongside
 * `buildCerebrumManifest` / `buildMediaManifest`.
 */
export function buildListsManifest(version: string): ManifestPayload {
  return {
    pillar: LISTS_PILLAR_ID,
    version,
    contract: {
      package: '@pops/lists',
      version,
      tag: `contract-lists@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    nav: LISTS_NAV,
    pages: [...LISTS_PAGES],
    healthcheck: { path: '/health' },
  };
}
