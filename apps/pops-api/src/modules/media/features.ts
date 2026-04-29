import type { FeatureManifest } from '@pops/types';

/**
 * Media features (PRD-094).
 *
 * - `media.plex.scheduler` reuses the legacy `plex_scheduler_enabled` settings
 *   key so behaviour is preserved across the migration.
 * - `media.rotation` reuses `rotation_enabled` for the same reason.
 * - `media.radarr` / `media.sonarr` are credential-only — when both URL and
 *   API key are set they are considered enabled (default `true`).
 */
export const mediaFeaturesManifest: FeatureManifest = {
  id: 'media',
  title: 'Media',
  icon: 'Film',
  order: 200,
  features: [
    {
      key: 'media.plex.scheduler',
      label: 'Plex auto-sync',
      description:
        'Background scheduler that syncs the Plex library and watch history on a fixed interval.',
      default: false,
      scope: 'system',
      requires: ['plex_url', 'plex_token'],
      settingKey: 'plex_scheduler_enabled',
      configureLink: '/settings#media.plex',
    },
    {
      key: 'media.rotation',
      label: 'Library rotation',
      description: 'Daily rotation cycle that swaps stale movies for fresh candidates.',
      default: false,
      scope: 'system',
      settingKey: 'rotation_enabled',
      configureLink: '/settings#media.rotation',
    },
    {
      key: 'media.radarr',
      label: 'Radarr',
      description: 'Request movie downloads for watchlist items.',
      default: true,
      scope: 'system',
      requires: ['radarr_url', 'radarr_api_key'],
      configureLink: '/settings#media.arr',
    },
    {
      key: 'media.sonarr',
      label: 'Sonarr',
      description: 'Request TV downloads for watchlist items.',
      default: true,
      scope: 'system',
      requires: ['sonarr_url', 'sonarr_api_key'],
      configureLink: '/settings#media.arr',
    },
  ],
};
