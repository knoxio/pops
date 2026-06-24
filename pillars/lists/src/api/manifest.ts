import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const LISTS_PILLAR_ID = 'lists' as const;

/**
 * Wire-format nav contribution for the lists pillar.
 *
 * Mirrors the app's `navConfig` (`pillars/lists/app/src/routes.tsx`)
 * field-for-field; Lucide icon names are kebab-case identifiers per the
 * wire schema. Detail pages (`/lists/:id`) intentionally stay off the
 * rail — they remain deep links, declared on the `pages` dimension below.
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
 * Wire-format pages contribution for the lists pillar.
 *
 * One descriptor per route declared in the app's `routes` array
 * (`pillars/lists/app/src/routes.tsx`) — index and the `:id` detail page.
 */
const LISTS_PAGES: readonly PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'lists-index' },
  { path: ':id', bundleSlot: 'lists-detail' },
];

/**
 * Lists pillar manifest payload.
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
