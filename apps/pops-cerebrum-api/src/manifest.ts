import { cerebrumManifest, egoManifest } from '@pops/cerebrum-contract/settings';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const CEREBRUM_PILLAR_ID = 'cerebrum' as const;

/**
 * Wire-format nav contribution for the cerebrum pillar (PRD-243 US-02).
 *
 * Mirrors the shell-side `navConfig` exported from `@pops/app-cerebrum`
 * (`packages/app-cerebrum/src/routes.tsx`) — same items, same order — with
 * the runtime Lucide icon names rewritten as kebab-case identifiers per
 * the `NavConfigDescriptor` wire shape from PR #3230. `order: 600` places
 * cerebrum sixth in the shell's `registeredApps` array
 * (`apps/pops-shell/src/app/nav/registry.ts`), matching today's layout.
 */
const CEREBRUM_NAV: NavConfigDescriptor = {
  id: 'cerebrum',
  label: 'Cerebrum',
  labelKey: 'cerebrum',
  icon: 'book-open',
  color: 'sky',
  basePath: '/cerebrum',
  order: 600,
  items: [
    { path: '', label: 'Ingest', labelKey: 'cerebrum.ingest', icon: 'file-text' },
    { path: '/engrams', label: 'Engrams', labelKey: 'cerebrum.engrams.nav', icon: 'library' },
    { path: '/query', label: 'Query', labelKey: 'cerebrum.query.nav', icon: 'search' },
    {
      path: '/documents',
      label: 'Documents',
      labelKey: 'cerebrum.documents.nav',
      icon: 'file-text',
    },
    { path: '/nudges', label: 'Nudges', labelKey: 'cerebrum.nudges', icon: 'bell' },
    {
      path: '/proposals',
      label: 'Proposals',
      labelKey: 'cerebrum.proposals',
      icon: 'git-pull-request',
    },
    { path: '/glia', label: 'Glia', labelKey: 'cerebrum.glia.nav', icon: 'activity' },
    { path: '/reflex', label: 'Reflex', labelKey: 'cerebrum.reflex.nav', icon: 'zap' },
    { path: '/plexus', label: 'Plexus', labelKey: 'cerebrum.plexus.nav', icon: 'plug' },
  ],
};

/**
 * Wire-format pages contribution for the cerebrum pillar (PRD-243 US-02).
 *
 * One descriptor per route declared in `@pops/app-cerebrum`'s `routes`
 * array. `bundleSlot` is the kebab-case identifier the shell-side
 * workspace bundle map (PRD-243 US-03) will resolve back to the React
 * component currently held in `installed-modules.ts`.
 *
 * The `chat` route hosts ego's chat panel (PRD-099) — it lives in
 * `@pops/app-cerebrum` so it stays mounted under `/cerebrum/*` even
 * though the chat panel itself ships from `@pops/overlay-ego`. Ego's
 * overlay surface (the floating FAB) is NOT carried here: the current
 * `NavConfigDescriptor` does not support overlay/shortcut shapes — that
 * gap is tracked for follow-up (see PR body).
 */
const CEREBRUM_PAGES: readonly PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'cerebrum-ingest' },
  { path: 'chat', bundleSlot: 'cerebrum-chat' },
  { path: 'nudges', bundleSlot: 'cerebrum-nudges' },
  { path: 'proposals', bundleSlot: 'cerebrum-proposal-queue' },
  { path: 'engrams', bundleSlot: 'cerebrum-engrams-list' },
  { path: 'engrams/:id', bundleSlot: 'cerebrum-engram-detail' },
  { path: 'documents', bundleSlot: 'cerebrum-documents' },
  { path: 'query', bundleSlot: 'cerebrum-query' },
  { path: 'reflex', bundleSlot: 'cerebrum-reflex-list' },
  { path: 'reflex/:name', bundleSlot: 'cerebrum-reflex-detail' },
  { path: 'plexus', bundleSlot: 'cerebrum-plexus-list' },
  { path: 'plexus/:adapterId', bundleSlot: 'cerebrum-plexus-detail' },
  { path: 'glia', bundleSlot: 'cerebrum-glia-dashboard' },
];

/**
 * Cerebrum pillar manifest (PRD-240 US-03, extended in PRD-243 US-02).
 *
 * Declares the `settings.manifests` dimension on the cerebrum API's
 * manifest payload — the cerebrum sub-domain (`cerebrumManifest`) and
 * the ego sub-domain (`egoManifest`) per ADR-026. Both descriptors are
 * sourced from the cerebrum contract package's `./settings` subpath, so
 * the pillar is the sole declarer of its settings UI contribution. See
 * [ADR-037](../../../../docs/architecture/adr-037-settings-as-manifest-dimension.md)
 * for the dimension's design and PRD-240 for the rollout plan.
 *
 * PRD-243 US-02 adds the `nav` and `pages` UI dimensions. The cerebrum
 * pillar carries its own app-rail entry + routable pages; ego's overlay
 * surface stays mounted via `@pops/overlay-ego`'s manifest and is not
 * representable in today's `NavConfigDescriptor` shape (deferred).
 */
export function buildCerebrumManifest(version: string): ManifestPayload {
  return {
    pillar: CEREBRUM_PILLAR_ID,
    version,
    contract: {
      package: '@pops/cerebrum-contract',
      version,
      tag: `contract-cerebrum@v${version}`,
    },
    routes: {
      queries: ['cerebrum.nudges.list', 'cerebrum.nudges.get', 'cerebrum.nudges.contradictions'],
      mutations: ['cerebrum.nudges.dismiss'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [cerebrumManifest, egoManifest] },
    nav: CEREBRUM_NAV,
    pages: [...CEREBRUM_PAGES],
    healthcheck: { path: '/health' },
  };
}
