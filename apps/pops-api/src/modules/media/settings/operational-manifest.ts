import { eloGroup, paginationGroup, tierListGroup } from './comparisons-manifest.js';
import { sessionGroup, shelvesGroup } from './discovery-manifest.js';
import {
  mediaPaginationGroup,
  plexSyncGroup,
  thetvdbGroup,
  tmdbGroup,
  tmdbTopRatedGroup,
} from './integrations-manifest.js';

/**
 * Media operational settings manifest — assembled from domain-specific group
 * files to stay under the max-lines lint rule.
 *
 * Covers comparisons (ELO, tier lists), discovery (sessions, shelves),
 * integrations (TheTVDB, TMDB, Plex sync), pagination, and rotation sources.
 */
import type { SettingsManifest } from '@pops/types';

export const mediaOperationalManifest: SettingsManifest = {
  id: 'media.operational',
  title: 'Media Operations',
  icon: 'Clapperboard',
  order: 130,
  groups: [
    eloGroup,
    tierListGroup,
    paginationGroup,
    sessionGroup,
    shelvesGroup,
    thetvdbGroup,
    tmdbGroup,
    plexSyncGroup,
    mediaPaginationGroup,
    tmdbTopRatedGroup,
  ],
};
