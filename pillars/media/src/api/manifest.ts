/**
 * Media pillar manifest payload builder.
 *
 * Declares the wire-format manifest the media pillar registers with the
 * central registry on boot (opt-in via `POPS_REGISTRY_ENABLED`). The `nav` +
 * `pages` UI dimensions let the shell derive the media app-rail entry and
 * route surface from the registry walk. Source values match
 * `packages/app-media/src/routes.tsx` (icons in the kebab-case wire form
 * required by `NavConfigDescriptorSchema`).
 *
 * `routes` grows per migration slice — only domains served over REST are
 * listed. Movies is the first; later slices append their routes.
 */
import {
  arrManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '../contract/settings/index.js';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const MEDIA_PILLAR_ID = 'media' as const;

const MEDIA_NAV: NavConfigDescriptor = {
  id: 'media',
  label: 'Media',
  labelKey: 'media',
  icon: 'film',
  color: 'violet',
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

const MEDIA_PAGES: PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'media-library' },
  { path: 'watchlist', bundleSlot: 'media-watchlist' },
  { path: 'history', bundleSlot: 'media-history' },
  { path: 'discover', bundleSlot: 'media-discover' },
  { path: 'rankings', bundleSlot: 'media-rankings' },
  { path: 'search', bundleSlot: 'media-search' },
  { path: 'compare', bundleSlot: 'media-compare' },
  { path: 'tier-list', bundleSlot: 'media-tier-list' },
];

export function buildMediaManifest(version: string): ManifestPayload {
  return {
    pillar: MEDIA_PILLAR_ID,
    version,
    contract: {
      package: '@pops/media',
      version,
      tag: `contract-media@v${version}`,
    },
    routes: {
      queries: [
        'media.movies.list',
        'media.movies.get',
        'media.watchlist.list',
        'media.watchlist.status',
        'media.watchlist.get',
        'media.shelfImpressions.recent',
        'media.shelfImpressions.freshness',
      ],
      mutations: [
        'media.movies.create',
        'media.movies.update',
        'media.movies.delete',
        'media.watchlist.add',
        'media.watchlist.update',
        'media.watchlist.reorder',
        'media.watchlist.remove',
        'media.shelfImpressions.record',
        'media.shelfImpressions.cleanup',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['media/movie', 'media/tv-show', 'media/watchlist-item'] },
    consumedSettings: { keys: [] },
    settings: {
      manifests: [plexManifest, arrManifest, rotationManifest, mediaOperationalManifest],
    },
    nav: MEDIA_NAV,
    pages: MEDIA_PAGES,
    healthcheck: { path: '/health' },
  };
}
