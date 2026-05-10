/**
 * Module manifest types — the contract every POPS module exports so that the
 * shell (frontend), the tRPC root (backend), and every cross-cutting concern
 * (settings, features, search, AI tools, URI resolution, migrations) can
 * assemble themselves from metadata rather than from hard-coded import lists
 * or side-effect registrations.
 *
 * PRD-098 introduced the metadata-only shape; PRD-100 added the env-driven
 * loader; PRD-101 (this iteration) extends the shape with the slots the
 * cross-cutting concerns need so a module is a single file describing
 * everything the platform reads from it.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/` for the PRD
 * (`README.md`) and the per-slot user stories (`us-NN-*.md`). This file is
 * types + structural validation only — consumer wiring lands in US-03..US-10.
 */
import {
  assertBackend,
  assertCapabilities,
  assertFeatures,
  assertFrontend,
  assertNonEmptyString,
  assertSearch,
  assertSurfaces,
  assertUriHandler,
  fail,
  isObject,
} from './manifest-assertions.js';

import type { AiToolDescriptor } from './ai-tool.js';
import type { Capability } from './capability.js';
import type { FeatureManifest } from './feature-manifest.js';
import type { IngestSourceDescriptor } from './ingest-source.js';
import type { MigrationDescriptor } from './migration.js';
import type { SearchAdapterDescriptor } from './search-adapter.js';
import type { SettingsManifest } from './settings-manifest.js';
import type { UriHandlerDescriptor } from './uri-handler.js';

/**
 * Surfaces a module can present to the shell.
 * - `app`     — page-routed module owning navigation and `/path` routes
 * - `overlay` — mounted into a shell chrome slot; summoned by shortcut/icon
 *
 * A module may declare both: `surfaces: ['app', 'overlay']` — the dual-surface
 * pattern (e.g. ego has both `/cerebrum/chat` and a floating panel).
 */
export type ModuleSurface = 'app' | 'overlay';

export interface ModuleOverlayConfig {
  /**
   * Identifier of the chrome slot the overlay mounts into. Slot names are
   * defined by the shell; unknown slots are ignored (with a warning) at
   * mount time.
   */
  chromeSlot: string;
  /**
   * Optional keyboard shortcut to summon the overlay. Uses the same format
   * as `mousetrap`/`tinykeys` (e.g. `mod+i`). Resolved by the shell.
   */
  shortcut?: string;
}

/**
 * Frontend-side manifest fields. Generic over the route and nav config types
 * so this package does not have to depend on `react-router` or `@pops/navigation`.
 */
export interface ModuleFrontendManifest<TRoutes = unknown, TNavConfig = unknown> {
  /** Lazy `RouteObject[]` (or equivalent) mounted by the shell router. */
  routes?: TRoutes;
  /** Optional navigation config (icon, label, ordering). */
  navConfig?: TNavConfig;
  /** Set when `surfaces` includes `'overlay'`. */
  overlay?: ModuleOverlayConfig;
}

/**
 * Backend-side manifest fields. Generic over the router type so this package
 * does not have to depend on tRPC.
 */
export interface ModuleBackendManifest<TRouter = unknown> {
  /** tRPC router (or equivalent) composed into the root by the loader. */
  router: TRouter;
  /**
   * MCP / Ego-callable tools this module exposes. Aggregated by the MCP
   * server via `MODULES.flatMap(m => m.backend?.aiTools)` — see PRD-101 US-10.
   */
  aiTools?: readonly AiToolDescriptor[];
  /**
   * SQL migrations owned by this module. The migration runner skips entries
   * whose owning module is not in the install set — see PRD-101 US-09.
   */
  migrations?: readonly MigrationDescriptor[];
  /**
   * External data sources this module ingests from. Typed slot only — the
   * only consumer today is Cerebrum (Plexus, PRD-090) and that integration
   * stays internal to the module. Reserved for future platform-level UIs.
   */
  ingestSources?: readonly IngestSourceDescriptor[];
}

/**
 * The module manifest. Backend-only modules fill `backend`; frontend-only
 * apps fill `frontend`; modules with both surfaces fill both.
 *
 * `id` is the canonical module identifier and the value the runtime loader
 * matches against `POPS_APPS` / `POPS_OVERLAYS` entries.
 */
export interface ModuleManifest<TRouter = unknown, TRoutes = unknown, TNavConfig = unknown> {
  /** Canonical id, e.g. `finance`, `media`, `ego`. Lowercase, no spaces. */
  id: string;
  /** Human-readable name, used in admin UIs. */
  name: string;
  /** Optional semver-ish version string. */
  version?: string;
  /** Which surfaces this module exposes. Must contain at least one entry. */
  surfaces: readonly ModuleSurface[];
  /** One-line description, used in admin UIs. */
  description?: string;
  /** Modules this one depends on at runtime; loader fails fast on a missing dep. */
  dependsOn?: readonly string[];
  /**
   * Typed RBAC capability identifiers this module owns, namespaced by id
   * (e.g. `finance.transaction.read`). Supersedes the free-form `provides`
   * slot from PRD-098. PRD-101 only defines the slot — RBAC enforcement is
   * a future PRD.
   */
  capabilities?: readonly Capability[];
  /** Plugged in as a slot from PRD-093. */
  settings?: SettingsManifest;
  /**
   * Per-module feature toggle definitions (PRD-094). Aggregated by the
   * features admin via `MODULES.flatMap(m => m.features)` — see PRD-101 US-05.
   */
  features?: readonly FeatureManifest[];
  /**
   * Search adapter declarations. Aggregated by the unified search engine via
   * `MODULES.flatMap(m => m.search)` — see PRD-101 US-06.
   */
  search?: readonly SearchAdapterDescriptor[];
  /**
   * Object types this module owns under `pops:{id}/{type}/...` plus a resolver
   * the central URI dispatcher invokes. ADR-012, PRD-101 US-08.
   */
  uriHandler?: UriHandlerDescriptor;
  /** Filled when the module exposes a backend tRPC router. */
  backend?: ModuleBackendManifest<TRouter>;
  /** Filled when the module exposes a frontend app or overlay. */
  frontend?: ModuleFrontendManifest<TRoutes, TNavConfig>;
}

/**
 * Runtime guard that asserts a value satisfies the structural shape of
 * `ModuleManifest`, including every PRD-101 cross-cutting slot.
 *
 * The registry build (PRD-101 US-02) calls this on every loaded manifest;
 * failures throw `TypeError` with a message that names the offending field
 * and embeds the supplied `context` so the caller can include the module id.
 */
export function assertModuleManifest(
  value: unknown,
  context = 'manifest'
): asserts value is ModuleManifest {
  if (!isObject(value)) {
    fail(context, 'expected an object');
  }
  assertNonEmptyString(value.id, context, 'id');
  assertNonEmptyString(value.name, context, 'name');
  const moduleId = value.id as string;
  const surfaces = assertSurfaces(value.surfaces, context);
  assertCapabilities(value.capabilities, context, moduleId);
  assertFeatures(value.features, context);
  assertSearch(value.search, context);
  assertUriHandler(value.uriHandler, context);
  assertBackend(value.backend, context);
  assertFrontend(value.frontend, surfaces, context);
}
