/**
 * GENERATED FILE — do not edit by hand.
 *
 * Built from `packages/module-registry/scripts/known-modules.ts` by
 * `pnpm registry:build`. CI verifies this file is up to date; commit
 * regenerated output alongside any change to the source manifest list.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-02-build-time-registry.md`.
 */

export const KNOWN_MODULES = ['ai', 'cerebrum', 'ego', 'finance', 'inventory', 'media'] as const;

export const MODULES = [
  {
    id: 'ai',
    name: 'AI Ops',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description: 'AI usage, providers, model config, prompts, and rules browser.',
    hasBackend: false,
    hasFrontend: false,
  },
  {
    id: 'cerebrum',
    name: 'Cerebrum',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description:
      'Engram storage, retrieval, ingest/emit, plexus, reflex, glia — knowledge graph and agents.',
    hasBackend: false,
    hasFrontend: false,
  },
  {
    id: 'ego',
    name: 'Ego',
    version: '0.1.0',
    surfaces: ['app', 'overlay'] as const,
    description: 'Conversational AI interface to Cerebrum (PRD-087).',
    hasBackend: false,
    hasFrontend: true,
    overlay: { chromeSlot: 'assistant', shortcut: 'mod+i' },
  },
  {
    id: 'finance',
    name: 'Finance',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description: 'Transactions, budgets, entities, and import pipeline.',
    hasBackend: false,
    hasFrontend: false,
  },
  {
    id: 'inventory',
    name: 'Inventory',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description: 'Home items, locations, connections, warranties, and documents.',
    hasBackend: false,
    hasFrontend: false,
  },
  {
    id: 'media',
    name: 'Media',
    version: '0.1.0',
    surfaces: ['app'] as const,
    description: 'Movies, TV shows, watch history, and Plex/TMDB/TVDB sync.',
    hasBackend: false,
    hasFrontend: false,
  },
] as const;

export type GeneratedModuleId = 'ai' | 'cerebrum' | 'ego' | 'finance' | 'inventory' | 'media';
