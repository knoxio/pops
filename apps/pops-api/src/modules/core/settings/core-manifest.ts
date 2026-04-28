import type { SettingsManifest } from '@pops/types';

export const coreManifest: SettingsManifest = {
  id: 'core',
  title: 'Core',
  icon: 'Settings',
  order: 500,
  groups: [
    {
      id: 'corrections',
      title: 'Corrections',
      fields: [
        {
          key: 'corrections_high_confidence_threshold',
          label: 'High Confidence Threshold',
          type: 'number',
          default: '0.9',
          description:
            'Correction matches at or above this confidence are classified as "matched", below as "uncertain".',
          validation: { min: 0, max: 1 },
        },
      ],
    },
    {
      id: 'pagination',
      title: 'Shared Pagination',
      description: 'Default and maximum page sizes shared across all list endpoints.',
      fields: [
        {
          key: 'shared_pagination_default_limit',
          label: 'Default Limit',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
        {
          key: 'shared_pagination_max_limit',
          label: 'Max Limit',
          type: 'number',
          default: '500',
          validation: { min: 1, max: 10000 },
        },
      ],
    },
    {
      id: 'ai-retry',
      title: 'AI Retry',
      description: 'Exponential backoff settings for Anthropic API rate limit retries.',
      fields: [
        {
          key: 'ai_retry_max_retries',
          label: 'Max Retries',
          type: 'number',
          default: '5',
          validation: { min: 0, max: 20 },
        },
        {
          key: 'ai_retry_base_delay_ms',
          label: 'Base Delay (ms)',
          type: 'number',
          default: '1000',
          description: 'Initial backoff delay, doubled on each retry plus random jitter.',
          validation: { min: 100 },
        },
      ],
    },
    {
      id: 'rate-limiter',
      title: 'Rate Limiter',
      description: 'Settings for the Express rate limiter on public endpoints.',
      fields: [
        {
          key: 'rate_limit_window_ms',
          label: 'Window (ms)',
          type: 'number',
          default: '900000',
          description: 'Time window for rate limiting (default 15 minutes).',
          validation: { min: 1000 },
        },
        {
          key: 'rate_limit_max_requests',
          label: 'Max Requests',
          type: 'number',
          default: '100',
          description: 'Maximum requests per IP in the window.',
          validation: { min: 1 },
        },
      ],
    },
    {
      id: 'queues',
      title: 'Queue Concurrency',
      description: 'Worker concurrency per BullMQ queue.',
      fields: [
        {
          key: 'queue_sync_concurrency',
          label: 'Sync Queue',
          type: 'number',
          default: '1',
          validation: { min: 1, max: 50 },
        },
        {
          key: 'queue_embeddings_concurrency',
          label: 'Embeddings Queue',
          type: 'number',
          default: '2',
          validation: { min: 1, max: 50 },
        },
        {
          key: 'queue_curation_concurrency',
          label: 'Curation Queue',
          type: 'number',
          default: '1',
          validation: { min: 1, max: 50 },
        },
        {
          key: 'queue_default_concurrency',
          label: 'Default Queue',
          type: 'number',
          default: '3',
          validation: { min: 1, max: 50 },
        },
      ],
    },
    {
      id: 'env-ttl-watcher',
      title: 'Environment TTL Watcher',
      fields: [
        {
          key: 'env_ttl_watcher_interval_ms',
          label: 'Purge Interval (ms)',
          type: 'number',
          default: '30000',
          description: 'How often expired environments are purged.',
          validation: { min: 1000 },
          requiresRestart: true,
        },
      ],
    },
  ],
};
