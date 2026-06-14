import {
  arrManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '@pops/media-contract/settings';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const MEDIA_PILLAR_ID = 'media' as const;

/**
 * Wire-format nav contribution for the media pillar (PRD-243 US-02).
 *
 * Mirrors `@pops/app-media`'s `navConfig` field-for-field; Lucide names
 * are rewritten as kebab-case identifiers per the wire schema from
 * PR #3230. `order: 20` matches today's position in
 * `apps/pops-shell/src/app/nav/registry.ts` (`registeredApps[1]`).
 */
const MEDIA_NAV: NavConfigDescriptor = {
  id: 'media',
  label: 'Media',
  labelKey: 'media',
  icon: 'film',
  color: 'indigo',
  basePath: '/media',
  order: 20,
  items: [
    { path: '', label: 'Library', labelKey: 'media.library', icon: 'library' },
    { path: '/watchlist', label: 'Watchlist', labelKey: 'media.watchlist', icon: 'bookmark' },
    { path: '/history', label: 'History', labelKey: 'media.history', icon: 'clock' },
    { path: '/discover', label: 'Discover', labelKey: 'media.discover', icon: 'compass' },
    { path: '/rankings', label: 'Rankings', labelKey: 'media.rankings', icon: 'trophy' },
    { path: '/search', label: 'Search', labelKey: 'media.search', icon: 'search' },
    { path: '/compare', label: 'Compare', labelKey: 'media.compare', icon: 'arrow-left-right' },
    { path: '/tier-list', label: 'Tier List', labelKey: 'media.tierList', icon: 'layers' },
  ],
};

/**
 * Wire-format pages contribution for the media pillar (PRD-243 US-02).
 *
 * One descriptor per route declared in `@pops/app-media`'s `routes`
 * array. Settings-redirect routes (`/media/plex`, `/media/arr`,
 * `/media/rotation`, `/media/calendar`) ARE included so the shell-side
 * bundle map (PRD-243 US-03) can mount the same `<Navigate>` element
 * that lives there today; the slot identifiers carry a `-redirect`
 * suffix to keep them distinct from real pages.
 */
const MEDIA_PAGES: readonly PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'media-library' },
  { path: 'movies/:id', bundleSlot: 'media-movie-detail' },
  { path: 'tv/:id', bundleSlot: 'media-tv-show-detail' },
  { path: 'tv/:id/season/:num', bundleSlot: 'media-season-detail' },
  { path: 'watchlist', bundleSlot: 'media-watchlist' },
  { path: 'history', bundleSlot: 'media-history' },
  { path: 'discover', bundleSlot: 'media-discover' },
  { path: 'rankings', bundleSlot: 'media-rankings' },
  { path: 'search', bundleSlot: 'media-search' },
  { path: 'compare', bundleSlot: 'media-compare-arena' },
  { path: 'compare/history', bundleSlot: 'media-comparison-history' },
  { path: 'quick-pick', bundleSlot: 'media-quick-pick' },
  { path: 'plex', bundleSlot: 'media-plex-redirect' },
  { path: 'arr', bundleSlot: 'media-arr-redirect' },
  { path: 'rotation', bundleSlot: 'media-rotation-redirect' },
  { path: 'rotation/log', bundleSlot: 'media-rotation-log' },
  { path: 'rotation/candidates', bundleSlot: 'media-candidate-queue' },
  { path: 'arr/calendar', bundleSlot: 'media-calendar' },
  { path: 'calendar', bundleSlot: 'media-calendar-redirect' },
  { path: 'tier-list', bundleSlot: 'media-tier-list' },
  { path: 'debrief/:movieId', bundleSlot: 'media-debrief' },
  { path: 'debrief/:movieId/results', bundleSlot: 'media-debrief-results' },
];

/**
 * Media pillar manifest payload.
 *
 * Theme 13 PRD-158 introduced the registry handshake; this file is the
 * hand-rolled payload the media-api hands to `bootstrapPillar` at boot
 * (PRD-155 will generate it later from the contract).
 *
 * PRD-240 US-03 adds the `settings.manifests` block — each per-pillar
 * API contributes its own settings UI descriptors next to
 * `search.adapters` / `ai.tools` / `sinks`. The four media manifests
 * (`arr`, `plex`, `rotation`, `media-operational`) flow in from the
 * `@pops/media-contract/settings` subpath rather than the legacy
 * `@pops/module-registry/settings` or static `@pops/pillar-sdk/settings`
 * barrels.
 *
 * PRD-243 US-02 adds the `nav` + `pages` UI dimensions — verbatim copies
 * of the shell-side registry entries today, ready for the US-03 rewrite
 * to walk these off the manifest instead of importing `@pops/app-*`
 * directly.
 */
export function buildMediaManifest(version: string): ManifestPayload {
  return {
    pillar: MEDIA_PILLAR_ID,
    version,
    contract: {
      package: '@pops/media-contract',
      version,
      tag: `contract-media@v${version}`,
    },
    routes: {
      queries: [
        'media.shelfImpressions.getRecentImpressions',
        'media.shelfImpressions.getShelfFreshness',
      ],
      mutations: ['media.shelfImpressions.recordImpressions', 'media.shelfImpressions.cleanup'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: {
      manifests: [arrManifest, plexManifest, rotationManifest, mediaOperationalManifest],
    },
    nav: MEDIA_NAV,
    pages: [...MEDIA_PAGES],
    healthcheck: { path: '/health' },
  };
}
