/**
 * External-pillar UI loading (PRD-243 US-05, Option A).
 *
 * In-repo pillars reach the shell through the static `WORKSPACE_BUNDLE_MAP`
 * (`./bundle-map.tsx`) — a build-time import graph that ADR-002 keeps as a
 * single static Vite SPA. This module covers the orthogonal case: a pillar
 * the build does not know about, registered at runtime (PRD-228), whose
 * manifest advertises an `assetsBaseUrl`.
 *
 * The mechanism is the one US-05 recommends (Option A, not Module
 * Federation): the shell `import()`s the pillar's single ESM entry from the
 * URL it advertises and resolves each `PageDescriptor.bundleSlot` to a React
 * component the remote bundle exports. The nav rail comes off the wire
 * (`NavConfigDescriptor`) so it renders synchronously at boot; the remote
 * bundle is fetched lazily on first navigation, behind `React.lazy` +
 * `<Suspense>`, and wrapped in an `<ErrorBoundary>` so a failed load
 * (network error, missing slot, invalid bundle) degrades to a placeholder
 * instead of crashing the shell.
 *
 * This adds no bundler coupling and does not change how in-repo pillars are
 * bundled: it is a runtime dynamic `import()` of a URL, native to ES modules
 * and Vite. ADR-002 stands — the in-repo FE is still one static SPA.
 */
import { lazy, Suspense, type ComponentType } from 'react';

import { ErrorBoundary } from '@pops/ui';

import { iconMap } from './nav/icon-map';

import type { RouteObject } from 'react-router';

import type { NavConfigDescriptor, PageDescriptor } from '@pops/pillar-sdk';
import type { ModuleManifest } from '@pops/types';

import type { BundleEntry } from './bundle-map';
import type { AppNavConfig, AppNavItem, IconName } from './nav/types';

/**
 * The contract an external pillar's remote ESM bundle must satisfy.
 *
 * The bundle is fetched via `import(assetsBaseUrl)`; its module namespace is
 * expected to expose a `bundles` record keyed by the kebab-case
 * `PageDescriptor.bundleSlot` ids the pillar declares in its manifest. Each
 * value is a zero-prop-required React component the shell mounts under the
 * matching route. Keeping the contract to "a record of components" avoids
 * leaking the shell's router/React types across the wire boundary while
 * still being fully typed on the shell side.
 */
export interface RemotePillarUiModule {
  readonly bundles: Readonly<Record<string, ComponentType>>;
}

/**
 * Wire-shaped description of an external pillar's UI surface, projected from
 * its registry manifest. Unlike the in-repo `BundleEntry`, none of this
 * carries React references — the components live in the remote bundle and
 * are resolved lazily through `assetsBaseUrl`.
 */
export interface RemoteUiDescriptor {
  readonly pillarId: string;
  readonly assetsBaseUrl: string;
  readonly nav?: NavConfigDescriptor;
  readonly pages?: readonly PageDescriptor[];
}

/**
 * Default for `RemotePillarUiModule.import` — the production loader. A thin
 * indirection so tests can inject a fake remote module without a real
 * network fetch. `/* @vite-ignore *\/` keeps Vite from trying to resolve the
 * runtime URL at build time; the import is genuinely dynamic.
 */
export type RemoteModuleImporter = (assetsBaseUrl: string) => Promise<unknown>;

const defaultRemoteModuleImporter: RemoteModuleImporter = (assetsBaseUrl) =>
  import(/* @vite-ignore */ assetsBaseUrl);

/**
 * Narrow an unknown dynamic-import result to `RemotePillarUiModule`. Throws a
 * descriptive `Error` (never returns a partial) so the lazy-import promise
 * rejects and the surrounding `<ErrorBoundary>` renders the fallback.
 */
function assertRemoteUiModule(value: unknown, pillarId: string): RemotePillarUiModule {
  if (typeof value !== 'object' || value === null || !('bundles' in value)) {
    throw new Error(`external pillar '${pillarId}' bundle does not export a 'bundles' record`);
  }
  const bundles = (value as { bundles: unknown }).bundles;
  if (typeof bundles !== 'object' || bundles === null) {
    throw new Error(`external pillar '${pillarId}' bundle 'bundles' export is not an object`);
  }
  return { bundles: bundles as Readonly<Record<string, ComponentType>> };
}

/**
 * Resolve a single `bundleSlot` from a freshly imported remote module to a
 * `{ default }` shape `React.lazy` expects. Rejects (so the boundary fires)
 * when the slot is absent — a manifest that names a slot the bundle does not
 * ship is a remote-side contract break, not a shell crash.
 */
async function loadRemoteComponent(
  descriptor: RemoteUiDescriptor,
  bundleSlot: string,
  importer: RemoteModuleImporter
): Promise<{ default: ComponentType }> {
  const imported = await importer(descriptor.assetsBaseUrl);
  const module = assertRemoteUiModule(imported, descriptor.pillarId);
  const component = module.bundles[bundleSlot];
  if (component === undefined) {
    throw new Error(
      `external pillar '${descriptor.pillarId}' bundle has no component for slot '${bundleSlot}'`
    );
  }
  return { default: component };
}

const RemoteLoadFallback = (
  <div className="p-6 text-muted-foreground" data-testid="external-pillar-load-error">
    This pillar&rsquo;s interface could not be loaded.
  </div>
);

const RemoteSuspenseFallback = (
  <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
);

/**
 * Build the lazy, guarded element the shell mounts for one external page.
 * The remote bundle is imported on first render of this element (so an
 * unvisited external pillar costs nothing); a rejected import is contained
 * by the `<ErrorBoundary>` and never propagates to the shell's router error
 * element.
 */
function remotePageElement(
  descriptor: RemoteUiDescriptor,
  page: PageDescriptor,
  importer: RemoteModuleImporter
): RouteObject {
  const LazyComponent = lazy(() => loadRemoteComponent(descriptor, page.bundleSlot, importer));
  return {
    path: page.index === true ? undefined : page.path,
    index: page.index === true ? true : undefined,
    element: (
      <ErrorBoundary fallback={() => RemoteLoadFallback}>
        <Suspense fallback={RemoteSuspenseFallback}>
          <LazyComponent />
        </Suspense>
      </ErrorBoundary>
    ),
  };
}

const FALLBACK_NAV_ICON: IconName = 'Compass';

/**
 * Resolve a wire-format kebab-case-or-PascalCase icon id to a shell
 * `IconName`. External pillars travel icons as identifiers; an unknown id
 * degrades to a neutral fallback rather than failing the nav build.
 */
function resolveNavIcon(icon: string): IconName {
  return icon in iconMap ? (icon as IconName) : FALLBACK_NAV_ICON;
}

function navItemFromDescriptor(item: NavConfigDescriptor['items'][number]): AppNavItem {
  return {
    path: item.path,
    label: item.label,
    labelKey: item.labelKey,
    icon: resolveNavIcon(item.icon),
  };
}

/**
 * Project a wire `NavConfigDescriptor` onto the runtime `AppNavConfig` the
 * app rail consumes. Icons resolve to `IconName` with a fallback; everything
 * else is a structural copy.
 */
function navConfigFromDescriptor(nav: NavConfigDescriptor): AppNavConfig {
  return {
    id: nav.id,
    label: nav.label,
    labelKey: nav.labelKey,
    icon: resolveNavIcon(nav.icon),
    color: nav.color,
    basePath: nav.basePath,
    items: nav.items.map(navItemFromDescriptor),
  };
}

/**
 * Synthesize the `BundleEntry` an external pillar contributes, mirroring the
 * shape in-repo pillars get from the static bundle map. The resulting entry
 * carries:
 *
 *   - `manifest.frontend.navConfig` derived from the wire `nav` descriptor
 *     (so the app rail renders synchronously, no remote fetch needed),
 *   - `manifest.frontend.routes` whose elements lazy-load the remote bundle
 *     per `PageDescriptor.bundleSlot`, each wrapped in an error boundary,
 *   - `navOrder` from the wire `nav.order` (app-rail ordering parity with
 *     in-repo pillars),
 *   - `assetsBaseUrl` echoed back for diagnostics.
 *
 * Returns `null` when the descriptor advertises an asset URL but no UI
 * surface (`nav` and `pages` both absent) — there is nothing to mount, so
 * the caller treats it like a backend-only pillar and skips it.
 *
 * `importer` is injectable so tests exercise the synthesis + resilience
 * without a network round-trip; production omits it and uses the dynamic
 * `import()` loader.
 */
export function synthesizeExternalBundleEntry(
  descriptor: RemoteUiDescriptor,
  importer: RemoteModuleImporter = defaultRemoteModuleImporter
): BundleEntry | null {
  const hasNav = descriptor.nav !== undefined;
  const hasPages = descriptor.pages !== undefined && descriptor.pages.length > 0;
  if (!hasNav && !hasPages) return null;

  const routes: RouteObject[] = (descriptor.pages ?? []).map((page) =>
    remotePageElement(descriptor, page, importer)
  );

  const frontend: NonNullable<ModuleManifest['frontend']> = { routes };
  if (descriptor.nav !== undefined) {
    frontend.navConfig = navConfigFromDescriptor(descriptor.nav);
  }

  const manifest: ModuleManifest = {
    id: descriptor.pillarId,
    name: descriptor.nav?.label ?? descriptor.pillarId,
    surfaces: ['app'],
    frontend,
  };

  return {
    manifest,
    navOrder: descriptor.nav?.order ?? Number.MAX_SAFE_INTEGER,
    assetsBaseUrl: descriptor.assetsBaseUrl,
  };
}
