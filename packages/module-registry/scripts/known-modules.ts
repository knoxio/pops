/**
 * Canonical metadata for every buildable module (PRD-101 US-02 + US-04 follow-up).
 *
 * The `KNOWN_MODULES` list below is the source of truth for which module ids
 * the registry knows about. Each entry is a structurally complete
 * `ModuleManifest` describing the module's identity, surfaces, and
 * cross-cutting slot declarations — the slots that are aggregated by the
 * platform after PRD-101.
 *
 * Settings (the only pure-data cross-cutting slot today, PRD-093) live in
 * `src/settings/` so both this build script and the runtime API consume them
 * from a single source of truth. Pure data, no runtime dependencies beyond
 * `@pops/types`.
 *
 * Code-bearing slots (`backend.router`, `frontend.routes`, handler functions)
 * stay where they are; consumer wiring in US-03..US-10 joins them back to the
 * registry metadata at the call site. The duplicated metadata fields (id,
 * name, surfaces, …) below mirror each app's runtime manifest — `pnpm
 * registry:build` validates every entry via `assertModuleManifest()` and
 * cross-checks against the live aggregator on the API side.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-02-build-time-registry.md`
 * and `us-04-settings-from-registry.md`.
 */
import {
  aiConfigManifest,
  arrManifest,
  cerebrumManifest,
  coreOperationalManifest,
  egoManifest,
  financeManifest,
  inventoryManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '../src/settings/index.js';

import type { ModuleManifest } from '@pops/types';

/**
 * Source manifest for each module the registry knows about. Order does not
 * matter — the build script sorts deterministically by id before emitting
 * `generated.ts`.
 *
 * `core` is always installed (PRD-100 contract: it's the platform shell, not
 * a domain module). `resolveInstalledIds` keeps it in the install set
 * regardless of `POPS_APPS` / `POPS_OVERLAYS`.
 */
export const MANIFEST_SOURCES: readonly ModuleManifest[] = [
  {
    id: 'core',
    name: 'Core',
    version: '0.1.0',
    surfaces: ['app'],
    description:
      'Cross-cutting platform services: entities, AI usage/providers, settings, features, search.',
    settings: [aiConfigManifest, coreOperationalManifest],
  },
  {
    id: 'finance',
    name: 'Finance',
    version: '0.1.0',
    surfaces: ['app'],
    description: 'Transactions, budgets, entities, and import pipeline.',
    settings: [financeManifest],
  },
  {
    id: 'media',
    name: 'Media',
    version: '0.1.0',
    surfaces: ['app'],
    description: 'Movies, TV shows, watch history, and Plex/TMDB/TVDB sync.',
    settings: [plexManifest, arrManifest, rotationManifest, mediaOperationalManifest],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    version: '0.1.0',
    surfaces: ['app'],
    description: 'Home items, locations, connections, warranties, and documents.',
    settings: [inventoryManifest],
  },
  {
    id: 'ai',
    name: 'AI Ops',
    version: '0.1.0',
    surfaces: ['app'],
    description: 'AI usage, providers, model config, prompts, and rules browser.',
  },
  {
    id: 'cerebrum',
    name: 'Cerebrum',
    version: '0.1.0',
    surfaces: ['app'],
    description:
      'Engram storage, retrieval, ingest/emit, plexus, reflex, glia — knowledge graph and agents.',
    settings: [cerebrumManifest],
  },
  {
    id: 'ego',
    name: 'Ego',
    version: '0.1.0',
    surfaces: ['app', 'overlay'],
    description: 'Conversational AI interface to Cerebrum (PRD-087).',
    frontend: {
      overlay: {
        chromeSlot: 'assistant',
        shortcut: 'mod+i',
      },
    },
    settings: [egoManifest],
  },
];

/**
 * Module ids that are always present in `MODULES` regardless of `POPS_APPS` /
 * `POPS_OVERLAYS`. `core` is the always-mounted platform shell — env vars
 * gate *optional* modules only (PRD-100).
 */
export const ALWAYS_INSTALLED_IDS: readonly string[] = ['core'];

/**
 * Canonical id list — the subset of module ids buildable in this monorepo.
 * Independent of install (the `MODULES` constant emitted by the build
 * narrows further when `POPS_APPS` / `POPS_OVERLAYS` are set).
 */
export const KNOWN_MODULE_IDS: readonly string[] = MANIFEST_SOURCES.map((m) => m.id);
