import type { SettingsManifest } from '@pops/types';

export const thetvdbManifest: SettingsManifest = {
  id: 'media.thetvdb',
  title: 'TheTVDB',
  icon: 'Tv',
  order: 130,
  groups: [
    {
      id: 'rate-limiter',
      title: 'Rate Limiter',
      description: 'Token bucket rate limiter for TheTVDB API requests.',
      fields: [
        {
          key: 'thetvdb_capacity',
          label: 'Bucket Capacity',
          type: 'number',
          default: '20',
          description: 'Maximum tokens in the rate limiter bucket.',
          validation: { min: 1 },
        },
        {
          key: 'thetvdb_refill_rate',
          label: 'Refill Rate (tokens/sec)',
          type: 'number',
          default: '2',
          description: 'Tokens added per second.',
          validation: { min: 1 },
        },
        {
          key: 'thetvdb_max_retries',
          label: 'Max Retries',
          type: 'number',
          default: '3',
          description: 'Maximum retry attempts on 429 responses.',
          validation: { min: 0, max: 10 },
        },
        {
          key: 'thetvdb_base_delay_ms',
          label: 'Base Retry Delay (ms)',
          type: 'number',
          default: '1000',
          description: 'Initial backoff delay, doubled on each retry.',
          validation: { min: 100 },
        },
      ],
    },
  ],
};

export const tmdbManifest: SettingsManifest = {
  id: 'media.tmdb',
  title: 'TMDB',
  icon: 'Film',
  order: 140,
  groups: [
    {
      id: 'image-download',
      title: 'Image Download',
      description: 'Retry settings for TMDB poster/backdrop downloads.',
      fields: [
        {
          key: 'tmdb_image_max_retries',
          label: 'Max Retries',
          type: 'number',
          default: '2',
          description: 'Maximum retry attempts for transient download failures.',
          validation: { min: 0, max: 10 },
        },
        {
          key: 'tmdb_image_retry_delay_ms',
          label: 'Retry Delay (ms)',
          type: 'number',
          default: '500',
          description: 'Base delay between retries (multiplied by attempt number).',
          validation: { min: 100 },
        },
      ],
    },
  ],
};

export const comparisonsManifest: SettingsManifest = {
  id: 'media.comparisons',
  title: 'Comparisons',
  icon: 'Scale',
  order: 150,
  groups: [
    {
      id: 'tier-list',
      title: 'Tier List',
      description: 'ELO compare arena and tier list configuration.',
      fields: [
        {
          key: 'comparisons_max_tier_list_movies',
          label: 'Max Tier List Movies',
          type: 'number',
          default: '8',
          description: 'Maximum movies per tier list placement round.',
          validation: { min: 2, max: 20 },
        },
        {
          key: 'comparisons_staleness_threshold',
          label: 'Staleness Threshold',
          type: 'number',
          default: '0.3',
          description: 'Minimum staleness value for tier list eligibility (0-1).',
          validation: { min: 0, max: 1 },
        },
        {
          key: 'comparisons_default_score',
          label: 'Default ELO Score',
          type: 'number',
          default: '1500',
          description: 'Starting ELO score for unscored movies.',
          validation: { min: 0 },
        },
      ],
    },
  ],
};

export const discoveryManifest: SettingsManifest = {
  id: 'media.discovery',
  title: 'Discovery',
  icon: 'Compass',
  order: 160,
  groups: [
    {
      id: 'session',
      title: 'Session Assembly',
      description: 'Controls how many and which types of shelves appear per discover session.',
      fields: [
        {
          key: 'discovery_session_target_min',
          label: 'Min Shelves per Session',
          type: 'number',
          default: '10',
          validation: { min: 1 },
        },
        {
          key: 'discovery_session_target_max',
          label: 'Max Shelves per Session',
          type: 'number',
          default: '15',
          validation: { min: 1 },
        },
        {
          key: 'discovery_max_seed_shelves',
          label: 'Max Seed Shelves',
          type: 'number',
          default: '3',
          validation: { min: 1 },
        },
        {
          key: 'discovery_max_genre_shelves',
          label: 'Max Genre Shelves',
          type: 'number',
          default: '2',
          validation: { min: 1 },
        },
        {
          key: 'discovery_max_local_per_window',
          label: 'Max Local per Window',
          type: 'number',
          default: '1',
          description: 'Max local shelves in each sliding window of 3.',
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'shelf-limits',
      title: 'Shelf Limits',
      description: 'Maximum items generated per shelf type.',
      fields: [
        {
          key: 'discovery_max_best_in_genre',
          label: 'Max Best-in-Genre',
          type: 'number',
          default: '5',
          validation: { min: 1 },
        },
        {
          key: 'discovery_max_crossover_pairs',
          label: 'Max Crossover Pairs',
          type: 'number',
          default: '6',
          validation: { min: 1 },
        },
        {
          key: 'discovery_max_top_dimension',
          label: 'Max Top Dimensions',
          type: 'number',
          default: '5',
          validation: { min: 1 },
        },
        {
          key: 'discovery_max_dimension_inspired',
          label: 'Max Dimension-Inspired',
          type: 'number',
          default: '3',
          validation: { min: 1 },
        },
      ],
    },
  ],
};
