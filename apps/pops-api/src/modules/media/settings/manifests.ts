import type { SettingsManifest } from '@pops/types';

export const plexManifest: SettingsManifest = {
  id: 'media.plex',
  title: 'Plex',
  icon: 'Film',
  order: 100,
  groups: [
    {
      id: 'connection',
      title: 'Connection',
      fields: [
        { key: 'plex_url', label: 'Plex URL', type: 'url' },
        {
          key: 'plex_token',
          label: 'Plex Token',
          type: 'password',
          sensitive: true,
          testAction: { procedure: 'media.plex.testConnection', label: 'Test Connection' },
        },
      ],
    },
    {
      id: 'library',
      title: 'Library',
      description: 'Enter the Plex library section IDs to sync.',
      fields: [
        {
          key: 'plex_movie_section_id',
          label: 'Movie Library Section',
          type: 'text',
          description: 'Enter the Plex movie library section ID.',
        },
        {
          key: 'plex_tv_section_id',
          label: 'TV Library Section',
          type: 'text',
          description: 'Enter the Plex TV library section ID.',
        },
      ],
    },
    {
      id: 'sync',
      title: 'Sync',
      fields: [
        { key: 'plex_scheduler_enabled', label: 'Auto Sync', type: 'toggle' },
        {
          key: 'plex_scheduler_interval_ms',
          label: 'Sync Interval',
          type: 'duration',
          description: 'How often to sync the Plex library.',
        },
        {
          key: 'plex_rate_limit_delay_ms',
          label: 'Discover Rate Limit Delay (ms)',
          type: 'number',
          default: '200',
          description: 'Milliseconds to wait between Plex Discover API calls.',
          validation: { min: 0 },
        },
        {
          key: 'plex_preview_limit',
          label: 'Sync Preview Limit',
          type: 'number',
          default: '10',
          description: 'Max items shown in sync diagnostic previews (missing seasons/episodes).',
          validation: { min: 1 },
        },
      ],
    },
  ],
};

export const arrManifest: SettingsManifest = {
  id: 'media.arr',
  title: 'Arr',
  icon: 'Download',
  order: 110,
  groups: [
    {
      id: 'radarr',
      title: 'Radarr',
      description: 'Movie download management.',
      fields: [
        { key: 'radarr_url', label: 'Radarr URL', type: 'url' },
        {
          key: 'radarr_api_key',
          label: 'Radarr API Key',
          type: 'password',
          sensitive: true,
          testAction: { procedure: 'media.arr.testRadarrSaved', label: 'Test Radarr' },
        },
      ],
    },
    {
      id: 'sonarr',
      title: 'Sonarr',
      description: 'TV show download management.',
      fields: [
        { key: 'sonarr_url', label: 'Sonarr URL', type: 'url' },
        {
          key: 'sonarr_api_key',
          label: 'Sonarr API Key',
          type: 'password',
          sensitive: true,
          testAction: { procedure: 'media.arr.testSonarrSaved', label: 'Test Sonarr' },
        },
      ],
    },
  ],
};

export const rotationManifest: SettingsManifest = {
  id: 'media.rotation',
  title: 'Rotation',
  icon: 'Shuffle',
  order: 120,
  groups: [
    {
      id: 'schedule',
      title: 'Schedule',
      fields: [
        { key: 'rotation_enabled', label: 'Enable Rotation', type: 'toggle' },
        {
          key: 'rotation_cron_expression',
          label: 'Cron Schedule',
          type: 'text',
          default: '0 3 * * *',
          description: 'Cron expression for when rotation runs (e.g. "0 3 * * *" = daily at 3 AM).',
        },
      ],
    },
    {
      id: 'capacity',
      title: 'Capacity',
      fields: [
        {
          key: 'rotation_target_free_gb',
          label: 'Target Free Space (GB)',
          type: 'number',
          default: '100',
          validation: { min: 0 },
        },
        {
          key: 'rotation_avg_movie_gb',
          label: 'Average Movie Size (GB)',
          type: 'number',
          default: '15',
          validation: { min: 1 },
        },
      ],
    },
    {
      id: 'protection',
      title: 'Protection',
      fields: [
        {
          key: 'rotation_protected_days',
          label: 'Protected Days',
          type: 'number',
          default: '30',
          description: 'Movies added within this many days are protected from rotation.',
          validation: { min: 0 },
        },
        {
          key: 'rotation_daily_additions',
          label: 'Daily Additions Limit',
          type: 'number',
          default: '2',
          validation: { min: 1 },
        },
        {
          key: 'rotation_leaving_days',
          label: 'Leaving Days',
          type: 'number',
          default: '7',
          description: 'How many days a movie is marked as "leaving" before removal.',
          validation: { min: 1 },
        },
      ],
    },
    {
      id: 'tmdb-source',
      title: 'TMDB Source',
      description: 'Configuration for the TMDB top-rated rotation source.',
      fields: [
        {
          key: 'rotation_tmdb_min_vote_count',
          label: 'TMDB Min Vote Count',
          type: 'number',
          default: '500',
          description: 'Minimum vote count for TMDB top-rated candidates.',
          validation: { min: 1 },
        },
      ],
    },
  ],
};

