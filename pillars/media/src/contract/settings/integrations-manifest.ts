/**
 * Media integration settings groups — TheTVDB rate limiter, TMDB image cache,
 * Plex sync, and pagination defaults.
 */
import type { SettingsGroup } from '@pops/types';

export const thetvdbGroup: SettingsGroup = {
  id: 'thetvdb',
  title: 'TheTVDB',
  description: 'Rate limiter and retry settings for TheTVDB API.',
  fields: [
    {
      key: 'media.thetvdb.rateLimitCapacity',
      label: 'Rate Limit Bucket Capacity',
      type: 'number',
      default: '20',
      validation: { min: 1 },
    },
    {
      key: 'media.thetvdb.rateLimitRefillRate',
      label: 'Rate Limit Refill Rate (tokens/sec)',
      type: 'number',
      default: '2',
      validation: { min: 1 },
    },
    {
      key: 'media.thetvdb.maxRetries',
      label: 'Max Retries',
      type: 'number',
      default: '3',
      validation: { min: 0, max: 10 },
    },
  ],
};

export const tmdbGroup: SettingsGroup = {
  id: 'tmdb',
  title: 'TMDB',
  description: 'TMDB genre cache and image download settings.',
  fields: [
    {
      key: 'media.tmdb.genreCacheTtlMs',
      label: 'Genre Cache TTL (ms)',
      type: 'duration',
      default: '86400000',
      description: 'How long to cache TMDB genre lists (default 24h).',
    },
    {
      key: 'media.tmdb.imageMaxRetries',
      label: 'Image Download Max Retries',
      type: 'number',
      default: '2',
      validation: { min: 0, max: 10 },
    },
    {
      key: 'media.tmdb.imageRetryDelayMs',
      label: 'Image Retry Delay (ms)',
      type: 'number',
      default: '500',
      validation: { min: 100 },
    },
  ],
};

export const plexSyncGroup: SettingsGroup = {
  id: 'plexSync',
  title: 'Plex Sync',
  description: 'Plex discover sync and watchlist settings.',
  fields: [
    {
      key: 'media.plex.rateLimitDelayMs',
      label: 'Discover Rate Limit Delay (ms)',
      type: 'number',
      default: '200',
      description: 'Delay between Plex Discover API calls during sync.',
      validation: { min: 0 },
    },
    {
      key: 'media.plex.clientPageSize',
      label: 'Library Page Size',
      type: 'number',
      default: '100',
      description: 'Page size when fetching Plex library sections.',
      validation: { min: 10, max: 500 },
    },
    {
      key: 'media.plex.friendsPageSize',
      label: 'Friends Watchlist Page Size',
      type: 'number',
      default: '50',
      validation: { min: 10, max: 200 },
    },
  ],
};

export const mediaPaginationGroup: SettingsGroup = {
  id: 'mediaPagination',
  title: 'Media Pagination',
  description: 'Default page sizes for media list endpoints.',
  fields: [
    {
      key: 'media.defaultLimit',
      label: 'Default Page Size',
      type: 'number',
      default: '50',
      description: 'Default page size for movies, TV shows, watchlist, and watch history.',
      validation: { min: 1, max: 200 },
    },
  ],
};

export const tmdbTopRatedGroup: SettingsGroup = {
  id: 'tmdbTopRated',
  title: 'TMDB Top Rated Source',
  description: 'Settings for the TMDB top-rated rotation source.',
  fields: [
    {
      key: 'media.rotation.tmdbDefaultPages',
      label: 'Default Pages',
      type: 'number',
      default: '5',
      validation: { min: 1, max: 25 },
    },
    {
      key: 'media.rotation.tmdbMaxPages',
      label: 'Max Pages',
      type: 'number',
      default: '25',
      validation: { min: 1, max: 100 },
    },
    {
      key: 'media.rotation.tmdbMinVoteCount',
      label: 'Min Vote Count',
      type: 'number',
      default: '500',
      description: 'Minimum TMDB vote count for top-rated eligibility.',
      validation: { min: 0 },
    },
    {
      key: 'media.rotation.letterboxdMaxPages',
      label: 'Letterboxd Max Pages',
      type: 'number',
      default: '20',
      validation: { min: 1, max: 100 },
    },
  ],
};
