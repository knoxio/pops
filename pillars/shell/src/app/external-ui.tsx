import { lazy, Suspense, type ComponentType } from 'react';

/**
 * Pillar UI loading (Option A).
 *
 * Every pillar reaches the shell through this module: one the build has never
 * heard of, registered at runtime, and one that lives in this repo, are the
 * same case. Both advertise an `assetsBaseUrl` on their manifest, and the
 * shell knows nothing else about either. POPS-3227 removed the static
 * `WORKSPACE_BUNDLE_MAP` that used to be the in-repo shortcut.
 *
 * The mechanism is Option A (not Module Federation): the shell `import()`s
 * the pillar's single ESM entry from the
 * URL it advertises and resolves each `PageDescriptor.bundleSlot` to a React
 * component the remote bundle exports. The nav rail comes off the wire
 * (`NavConfigDescriptor`) so it renders synchronously at boot; the remote
 * bundle is fetched lazily on first navigation, behind `React.lazy` +
 * `<Suspense>`, and wrapped in an `<ErrorBoundary>` so a failed load
 * (network error, missing slot, invalid bundle) degrades to a placeholder
 * instead of crashing the shell.
 *
 * This adds no bundler coupling: it is a runtime dynamic `import()` of a URL,
 * native to ES modules and Vite. What it costs is ADR-002's single static SPA,
 * which is the trade POPS-3215 made deliberately — the shell's own bundle no
 * longer carries any pillar's code, and a pillar can ship without it.
 *
 * ## The shared-runtime contract
 *
 * A remote bundle is a separate build, so anything it contains is a second
 * copy at runtime. For a package holding React context or module-global
 * state, a second copy is a correctness failure rather than a size one: two
 * React copies give two dispatchers and the pillar's first hook throws
 * `Invalid hook call`; two `@tanstack/react-query` copies give a component
 * reading an empty cache through a provider it cannot see; two `i18next`
 * copies give a pillar rendering raw keys. None of that fails at build time,
 * and each presents as a bug in the pillar rather than in the packaging.
 *
 * So: **the shell owns one instance of every specifier in
 * `SHARED_RUNTIME_SPECIFIERS` (`@pops/pillar-sdk/remote-build`), and a remote
 * bundle imports them rather than containing them.** The pillar build marks
 * them external — `pillars/purchases/app/vite.remote.config.ts` is the
 * reference, and its `scripts/build-remote.ts` fails the build if one slips
 * inside — and the shell resolves the resulting bare specifiers to its own
 * chunks through an import map it emits.
 *
 * Externalising without that import map is the point rather than a gap: the
 * browser refuses a bare specifier it cannot resolve, so a shell that has not
 * published its runtime fails the import loudly, into the `<ErrorBoundary>`
 * below, instead of a pillar quietly running on its own React. Emitting the
 * import map is the shell's half of this and lands with the first
 * loader-mounted in-repo pillar (POPS-3217).
 */
import { iconMap } from '@pops/navigation';
import { ErrorBoundary } from '@pops/ui';

import type { RouteObject } from 'react-router';

import type {
  CaptureOverlayDescriptor,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk';
import type { ModuleManifest } from '@pops/types';

import type { BundleEntry, CaptureOverlayMountProps } from './bundle-entry';
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
  /**
   * The pillar's capture-overlay contribution, if it has one. Resolved from
   * the same `bundles` record as its pages — a bundle carries every surface
   * the pillar contributes, keyed by slot, and the manifest says which slot
   * plays which role (POPS-3266).
   */
  readonly captureOverlay?: CaptureOverlayDescriptor;
  /**
   * Settings-widget slots this pillar's bundle supplies, named by the
   * settings groups its manifest declares. Same resolution as the overlay:
   * the shell looks each one up in `bundles` when a group asks for it.
   */
  readonly settingsWidgetSlots?: readonly string[];
}

/**
 * Default for `RemotePillarUiModule.import` — the production loader. A thin
 * indirection so tests can inject a fake remote module without a real
 * network fetch. `/* @vite-ignore *\/` keeps Vite from trying to resolve the
 * runtime URL at build time; the import is genuinely dynamic.
 */
export type RemoteModuleImporter = (assetsBaseUrl: string) => Promise<unknown>;

export const defaultRemoteModuleImporter: RemoteModuleImporter = (assetsBaseUrl) =>
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
): Promise<{ default: ComponentType<Record<string, unknown>> }> {
  const imported = await importer(descriptor.assetsBaseUrl);
  const module = assertRemoteUiModule(imported, descriptor.pillarId);
  const component = module.bundles[bundleSlot];
  if (component === undefined) {
    throw new Error(
      `external pillar '${descriptor.pillarId}' bundle has no component for slot '${bundleSlot}'`
    );
  }
  // Wrapped in a plain function component rather than handed back directly.
  // A `React.lazy` result is a perfectly good component to RENDER, but it is
  // an object, and React refuses a lazy that resolves to one: "Lazy element
  // type must resolve to a class or function." A pillar that code-splits its
  // pages — which is the ordinary thing to do, and what every in-repo pillar
  // does — therefore puts lazy components in `bundles`, and every page of it
  // failed to mount with an error naming double-wrapping rather than the
  // bundle. The wrapper costs one component in the tree and makes the contract
  // "any component" rather than "any component that is not itself lazy".
  //
  // It forwards props. Pages take none, so a wrapper that dropped them looked
  // correct for as long as pages were the only surface a bundle could supply
  // — and a capture overlay takes `onUnsavedChange`, so dropping them would
  // have rendered a working-looking overlay that lost the reader's draft with
  // no prompt when they closed the modal (POPS-3266).
  const Component = component as ComponentType<Record<string, unknown>>;
  return { default: (props: Record<string, unknown>) => <Component {...props} /> };
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
 *
 * Recurses into `children`, so a pillar whose route table nests — a layout
 * rendering tab chrome around an `<Outlet/>`, with its tabs beneath it —
 * mounts as that tree rather than as a flattened list (POPS-3256). The
 * boundary is built per node, not per pillar: a child whose slot the bundle
 * does not carry degrades to the placeholder inside the layout, leaving its
 * siblings and the layout itself mounted.
 */
function remotePageElement(
  descriptor: RemoteUiDescriptor,
  page: PageDescriptor,
  importer: RemoteModuleImporter
): RouteObject {
  const LazyComponent = lazy(() => loadRemoteComponent(descriptor, page.bundleSlot, importer));
  const element = (
    <ErrorBoundary fallback={() => RemoteLoadFallback}>
      <Suspense fallback={RemoteSuspenseFallback}>
        <LazyComponent />
      </Suspense>
    </ErrorBoundary>
  );

  // `RouteObject` is a union whose index arm has no `children`, so the two
  // shapes are built separately rather than assembled and cast. The schema
  // refuses `index` with children for the same reason from the other side.
  if (page.index === true) return { index: true, element };

  const children = page.children?.map((child) => remotePageElement(descriptor, child, importer));
  if (children !== undefined && children.length > 0) {
    return { path: page.path, element, children };
  }
  return { path: page.path, element };
}

/**
 * A component that renders a remote bundle's slot, forwarding its props.
 *
 * Pages are mounted as route elements and take no props; a capture overlay
 * takes `onUnsavedChange`, and dropping it would look correct until someone
 * closed the modal mid-edit and lost their work with no prompt. So this is
 * generic over the prop type and passes them straight through.
 *
 * The bundle is fetched on first render, like a page's, and the same boundary
 * pair contains the failure: a slot the bundle does not carry throws inside
 * `loadRemoteComponent`, the `ErrorBoundary` catches it, and the caller sees a
 * component that renders the placeholder rather than one that crashes the
 * surface hosting it.
 */
function remoteSlotComponent<P extends object>(
  descriptor: RemoteUiDescriptor,
  bundleSlot: string,
  importer: RemoteModuleImporter
): ComponentType<P> {
  const LazySlot = lazy(() =>
    loadRemoteComponent(descriptor, bundleSlot, importer)
  ) as ComponentType<P>;
  return function RemoteSlot(props: P) {
    return (
      <ErrorBoundary fallback={() => RemoteLoadFallback}>
        <Suspense fallback={RemoteSuspenseFallback}>
          <LazySlot {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  };
}

const FALLBACK_NAV_ICON: IconName = 'Compass';

/**
 * Resolve a wire-format icon id to a shell `IconName`.
 *
 * The wire spells icons in kebab-case — `KebabIdentifierSchema` rejects the
 * PascalCase `iconMap` is keyed by — so a bare `icon in iconMap` lookup could
 * not resolve anything a pillar is allowed to send, and every loader-mounted
 * pillar rendered the fallback on its rail entry and every page-nav item. The
 * kebab id is converted to the map's key form; a PascalCase id is still
 * accepted ahead of that, since an in-repo descriptor may carry one.
 *
 * An id that is neither degrades to a neutral fallback rather than failing
 * the nav build: a pillar naming an icon this shell build does not ship must
 * still mount.
 */
function resolveNavIcon(icon: string): IconName {
  if (icon in iconMap) return icon as IconName;
  const pascalCase = icon
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return pascalCase in iconMap ? (pascalCase as IconName) : FALLBACK_NAV_ICON;
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
 * The pillar's capture-overlay record, or `undefined` when it declares none.
 *
 * Built here rather than by the capture registry, so that registry keeps
 * resolving a slot through a `BundleEntry` and never learns what a remote
 * pillar is.
 */
function overlayBundlesFor(
  descriptor: RemoteUiDescriptor,
  importer: RemoteModuleImporter
): Readonly<Record<string, { Mount: ComponentType<CaptureOverlayMountProps> }>> | undefined {
  const overlay = descriptor.captureOverlay;
  if (overlay === undefined) return undefined;
  return {
    [overlay.bundleSlot]: {
      Mount: remoteSlotComponent<CaptureOverlayMountProps>(
        descriptor,
        overlay.bundleSlot,
        importer
      ),
    },
  };
}

/** The pillar's settings-widget record, or `undefined` when it declares none. */
function widgetBundlesFor(
  descriptor: RemoteUiDescriptor,
  importer: RemoteModuleImporter
): Readonly<Record<string, ComponentType>> | undefined {
  const slots = descriptor.settingsWidgetSlots ?? [];
  if (slots.length === 0) return undefined;
  return Object.fromEntries(
    slots.map((slot) => [slot, remoteSlotComponent(descriptor, slot, importer)])
  );
}

/**
 * Synthesize the `BundleEntry` an external pillar contributes — the same
 * `BundleEntry` shape every pillar resolves to now that POPS-3227 removed the
 * static bundle map that used to produce it directly for in-repo pillars. The
 * resulting entry carries:
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

  if (descriptor.captureOverlay !== undefined) {
    frontend.captureOverlay = descriptor.captureOverlay;
  }

  const entry: BundleEntry = {
    manifest,
    navOrder: descriptor.nav?.order ?? Number.MAX_SAFE_INTEGER,
    assetsBaseUrl: descriptor.assetsBaseUrl,
  };

  return {
    ...entry,
    captureOverlayBundles: overlayBundlesFor(descriptor, importer),
    settingsWidgetBundles: widgetBundlesFor(descriptor, importer),
  };
}
