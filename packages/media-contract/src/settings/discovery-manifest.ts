/**
 * Media discovery settings groups — session assembly and shelf constraints.
 */
import type { SettingsGroup } from '@pops/types';

export const sessionGroup: SettingsGroup = {
  id: 'discoverySession',
  title: 'Discover Sessions',
  description: 'Session assembly size and variety constraints.',
  fields: [
    {
      key: 'media.discovery.sessionTargetMin',
      label: 'Session Min Shelves',
      type: 'number',
      default: '10',
      validation: { min: 1, max: 50 },
    },
    {
      key: 'media.discovery.sessionTargetMax',
      label: 'Session Max Shelves',
      type: 'number',
      default: '15',
      validation: { min: 1, max: 50 },
    },
    {
      key: 'media.discovery.maxSeedShelves',
      label: 'Max Seed Shelves',
      type: 'number',
      default: '3',
      validation: { min: 1, max: 20 },
    },
    {
      key: 'media.discovery.maxGenreShelves',
      label: 'Max Genre Shelves',
      type: 'number',
      default: '2',
      validation: { min: 1, max: 20 },
    },
    {
      key: 'media.discovery.maxActiveCollections',
      label: 'Max Active Context Collections',
      type: 'number',
      default: '2',
      description: 'Max time-triggered context collections per session.',
      validation: { min: 1, max: 10 },
    },
  ],
};

export const shelvesGroup: SettingsGroup = {
  id: 'discoveryShelves',
  title: 'Shelf Limits',
  description: 'Per-shelf seed and result caps.',
  fields: [
    {
      key: 'media.discovery.maxBecauseYouWatchedSeeds',
      label: '"Because You Watched" Max Seeds',
      type: 'number',
      default: '10',
      validation: { min: 1, max: 50 },
    },
    {
      key: 'media.discovery.maxCreditsSeeds',
      label: 'Credits Shelf Max Seeds',
      type: 'number',
      default: '10',
      validation: { min: 1, max: 50 },
    },
    {
      key: 'media.discovery.maxBestInGenre',
      label: 'Best in Genre Max Results',
      type: 'number',
      default: '5',
      validation: { min: 1, max: 20 },
    },
    {
      key: 'media.discovery.maxCrossoverPairs',
      label: 'Genre Crossover Max Pairs',
      type: 'number',
      default: '6',
      validation: { min: 1, max: 20 },
    },
  ],
};
