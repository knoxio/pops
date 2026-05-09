/**
 * Module manifest types — the contract every POPS module exports so that the
 * shell (frontend) and the tRPC root (backend) can assemble themselves from
 * metadata rather than from hard-coded import lists.
 *
 * This module is metadata-only at the time of PRD-098. The runtime that
 * consumes these manifests (`POPS_APPS` / `POPS_OVERLAYS` env loader) lands in
 * PRD-100; the lint enforcement of cross-module boundaries that protects them
 * lands in PRD-097.
 *
 * See `docs/themes/01-foundation/prds/098-module-manifest/` for the full PRD.
 */
import type { SettingsManifest } from './settings-manifest.js';

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
  /** Capabilities this module provides (free-form strings, e.g. `finance.transaction`). */
  provides?: readonly string[];
  /** Plugged in as a slot from PRD-093. */
  settings?: SettingsManifest;
  /** Filled when the module exposes a backend tRPC router. */
  backend?: ModuleBackendManifest<TRouter>;
  /** Filled when the module exposes a frontend app or overlay. */
  frontend?: ModuleFrontendManifest<TRoutes, TNavConfig>;
}

/**
 * Runtime guard that asserts a value satisfies the structural shape of
 * `ModuleManifest`. Used by the manifest assertion test (US-04). Throws
 * `TypeError` with a descriptive message on the first failed check so the
 * stack trace points at the offending module.
 */
function fail(context: string, message: string): never {
  throw new TypeError(`${context}: ${message}`);
}

function assertNonEmptyString(value: unknown, context: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    fail(context, `'${field}' must be a non-empty string`);
  }
}

function assertSurfaces(value: unknown, context: string): readonly ModuleSurface[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(context, `'surfaces' must be a non-empty array`);
  }
  for (const s of value as readonly unknown[]) {
    if (s !== 'app' && s !== 'overlay') {
      fail(context, `invalid surface '${String(s)}'`);
    }
  }
  return value as readonly ModuleSurface[];
}

function assertBackend(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object') {
    fail(context, `'backend' must be an object when set`);
  }
  if ((value as Record<string, unknown>).router === undefined) {
    fail(context, `'backend.router' is required when 'backend' is set`);
  }
}

function assertFrontend(value: unknown, surfaces: readonly ModuleSurface[], context: string): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object') {
    fail(context, `'frontend' must be an object when set`);
  }
  if (!surfaces.includes('overlay')) return;
  const f = value as Record<string, unknown>;
  if (!f.overlay || typeof f.overlay !== 'object') {
    fail(context, `'frontend.overlay' is required when surfaces includes 'overlay'`);
  }
  if (typeof (f.overlay as Record<string, unknown>).chromeSlot !== 'string') {
    fail(context, `'frontend.overlay.chromeSlot' must be a string`);
  }
}

export function assertModuleManifest(
  value: unknown,
  context = 'manifest'
): asserts value is ModuleManifest {
  if (!value || typeof value !== 'object') {
    fail(context, 'expected an object');
  }
  const m = value as Record<string, unknown>;
  assertNonEmptyString(m.id, context, 'id');
  assertNonEmptyString(m.name, context, 'name');
  const surfaces = assertSurfaces(m.surfaces, context);
  assertBackend(m.backend, context);
  assertFrontend(m.frontend, surfaces, context);
}
