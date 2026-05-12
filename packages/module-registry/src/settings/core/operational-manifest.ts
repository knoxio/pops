/**
 * Core operational settings manifest — corrections, search, AI retry,
 * queue configuration, and shared pagination.
 */
import type { SettingsManifest } from '@pops/types';

export const coreOperationalManifest: SettingsManifest = {
  id: 'core.operational',
  title: 'Core Operations',
  icon: 'Settings',
  order: 210,
  groups: [
    {
      id: 'corrections',
      title: 'Corrections',
      description: 'Thresholds for the transaction correction engine.',
      fields: [
        {
          key: 'core.corrections.highConfidenceThreshold',
          label: 'High Confidence Threshold',
          type: 'number',
          default: '0.9',
          description: 'Minimum confidence for a correction to be classified as "matched" (0–1).',
          validation: { min: 0, max: 1 },
        },
        {
          key: 'core.corrections.minPatternLength',
          label: 'Min Pattern Length',
          type: 'number',
          default: '3',
          description: 'Minimum characters for an AI-generated correction pattern.',
          validation: { min: 1, max: 50 },
        },
        {
          key: 'core.corrections.previewLimit',
          label: 'Preview Match Limit',
          type: 'number',
          default: '25',
          description: 'Default result limit for correction preview matches.',
          validation: { min: 1, max: 200 },
        },
        {
          key: 'core.corrections.previewHardLimit',
          label: 'Preview Hard Limit',
          type: 'number',
          default: '200',
          validation: { min: 1, max: 1000 },
        },
        {
          key: 'core.corrections.previewRulesFetchLimit',
          label: 'Preview Rules Fetch Limit',
          type: 'number',
          default: '50000',
          validation: { min: 1000 },
        },
      ],
    },
    {
      id: 'coreSearch',
      title: 'Search',
      fields: [
        {
          key: 'core.search.showMoreLimit',
          label: 'Show More Limit',
          type: 'number',
          default: '5',
          description: 'Number of additional results shown when expanding search.',
          validation: { min: 1, max: 50 },
        },
      ],
    },
    {
      id: 'aiRetry',
      title: 'AI Rate Limit Retry',
      description: 'Exponential backoff settings for Anthropic API 429 retries.',
      fields: [
        {
          key: 'core.aiRetry.maxRetries',
          label: 'Max Retries',
          type: 'number',
          default: '5',
          validation: { min: 0, max: 20 },
        },
        {
          key: 'core.aiRetry.baseDelayMs',
          label: 'Base Delay (ms)',
          type: 'number',
          default: '1000',
          validation: { min: 100 },
        },
      ],
    },
    {
      id: 'corePagination',
      title: 'Shared Pagination',
      fields: [
        {
          key: 'core.defaultLimit',
          label: 'Default Page Size',
          type: 'number',
          default: '50',
          description: 'Default page size for entities, corrections, and settings lists.',
          validation: { min: 1, max: 200 },
        },
      ],
    },
    {
      id: 'queueConfig',
      title: 'Job Queue',
      description: 'Concurrency and job retention for BullMQ queues.',
      fields: [
        {
          key: 'core.queue.syncConcurrency',
          label: 'Sync Concurrency',
          type: 'number',
          default: '1',
          validation: { min: 1, max: 10 },
        },
        {
          key: 'core.queue.embeddingsConcurrency',
          label: 'Embeddings Concurrency',
          type: 'number',
          default: '2',
          validation: { min: 1, max: 10 },
        },
        {
          key: 'core.queue.defaultConcurrency',
          label: 'Default Concurrency',
          type: 'number',
          default: '3',
          validation: { min: 1, max: 10 },
        },
        {
          key: 'core.queue.completedRetention',
          label: 'Completed Job Retention',
          type: 'number',
          default: '100',
          description: 'Number of completed jobs to keep per queue.',
          validation: { min: 0 },
        },
      ],
    },
  ],
};
