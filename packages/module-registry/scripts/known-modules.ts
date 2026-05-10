/**
 * Canonical metadata for every buildable module (PRD-101 US-02).
 *
 * The `KNOWN_MODULES` list below is the source of truth for which module ids
 * the registry knows about. Each entry is a structurally complete
 * `ModuleManifest` describing the module's identity, surfaces, and
 * cross-cutting slot declarations — the slots that are aggregated by the
 * platform after PRD-101 (settings, features, search, capabilities,
 * uriHandler, aiTools, migrations).
 *
 * Why metadata-only instead of dynamically importing each module's runtime
 * `manifest` constant?
 *
 *   The frontend manifests live in `packages/app-*` and pull React routes;
 *   the backend manifests live in `apps/pops-api` and pull tRPC routers
 *   plus their entire transitive dep tree (drizzle, express, etc.). Loading
 *   either at registry build time would force `@pops/module-registry` to
 *   depend on every app — which inverts the dependency graph the consumer
 *   user stories (US-03..US-10) are about to set up.
 *
 *   The metadata duplicated here is small (id, name, surfaces, description,
 *   capabilities, dependsOn). The code-bearing slots (router, routes,
 *   handlers) stay where they are; consumer wiring in subsequent user
 *   stories joins the registry metadata back to the live references at the
 *   call site.
 *
 *   `pnpm registry:build` validates every entry below via
 *   `assertModuleManifest()` from `@pops/types`. A future migration that
 *   replaces this list with live imports (once each module exposes a
 *   manifest-only entry point) is a drop-in change behind the same
 *   `MODULES` consumer surface.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-02-build-time-registry.md`.
 */
import type { ModuleManifest } from '@pops/types';

/**
 * Source manifest for each module the registry knows about. Order does not
 * matter — the build script sorts deterministically by id before emitting
 * `generated.ts`.
 */
export const MANIFEST_SOURCES: readonly ModuleManifest[] = [
  {
    id: 'finance',
    name: 'Finance',
    version: '0.1.0',
    surfaces: ['app'],
    description: 'Transactions, budgets, entities, and import pipeline.',
  },
  {
    id: 'media',
    name: 'Media',
    version: '0.1.0',
    surfaces: ['app'],
    description: 'Movies, TV shows, watch history, and Plex/TMDB/TVDB sync.',
  },
  {
    id: 'inventory',
    name: 'Inventory',
    version: '0.1.0',
    surfaces: ['app'],
    description: 'Home items, locations, connections, warranties, and documents.',
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
  },
];

/**
 * Canonical id list — the subset of module ids buildable in this monorepo.
 * Independent of install (the `MODULES` constant emitted by the build
 * narrows further when `POPS_APPS` / `POPS_OVERLAYS` are set).
 */
export const KNOWN_MODULE_IDS: readonly string[] = MANIFEST_SOURCES.map((m) => m.id);
