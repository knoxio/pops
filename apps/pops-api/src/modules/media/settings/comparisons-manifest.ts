/**
 * Media comparisons settings groups — ELO, tier list, and staleness config.
 */
import type { SettingsGroup } from '@pops/types';

export const eloGroup: SettingsGroup = {
  id: 'elo',
  title: 'ELO Rating',
  description: 'Parameters for the comparison arena scoring algorithm.',
  fields: [
    {
      key: 'media.comparisons.eloK',
      label: 'K-Factor',
      type: 'number',
      default: '32',
      description: 'ELO K-factor controlling how much each comparison shifts scores.',
      validation: { min: 1, max: 128 },
    },
    {
      key: 'media.comparisons.defaultScore',
      label: 'Default Score',
      type: 'number',
      default: '1500',
      description: 'Starting ELO score for newly added movies.',
      validation: { min: 100 },
    },
  ],
};

export const tierListGroup: SettingsGroup = {
  id: 'tierList',
  title: 'Tier Lists',
  description: 'Tier-list selection and staleness thresholds.',
  fields: [
    {
      key: 'media.comparisons.maxTierListMovies',
      label: 'Max Tier List Movies',
      type: 'number',
      default: '8',
      description: 'Maximum movies per tier-list round.',
      validation: { min: 2, max: 20 },
    },
    {
      key: 'media.comparisons.stalenessThreshold',
      label: 'Staleness Threshold',
      type: 'number',
      default: '0.3',
      description: 'Minimum staleness score (0–1) for tier list eligibility.',
      validation: { min: 0, max: 1 },
    },
  ],
};

export const paginationGroup: SettingsGroup = {
  id: 'comparisonsPagination',
  title: 'Comparisons Pagination',
  fields: [
    {
      key: 'media.comparisons.defaultLimit',
      label: 'Default Page Size',
      type: 'number',
      default: '50',
      validation: { min: 1, max: 200 },
    },
  ],
};
