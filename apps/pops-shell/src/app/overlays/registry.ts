import { INSTALLED_MODULES } from '@pops/module-registry';
/**
 * Shell-level overlay registry (PRD-101 US-07).
 *
 * Joins the build-time module registry (`@pops/module-registry`) with each
 * overlay package's live manifest export. The build-time registry tells us
 * which overlays are installed (`POPS_OVERLAYS` may narrow the set); the
 * live manifest carries the lazy `component` loader the shell mounts.
 *
 * To add a new overlay module:
 *   1. Implement it as a `packages/overlay-<name>/` workspace package that
 *      exports a `ModuleManifest` with `surfaces: ['overlay']` and a
 *      `frontend.overlay.component` loader.
 *   2. Add the manifest to `SHELL_OVERLAY_MANIFESTS` below.
 *   3. Ensure the module id appears in `packages/module-registry`'s
 *      `MANIFEST_SOURCES` so it survives env filtering.
 */
import { manifest as egoManifest } from '@pops/overlay-ego';

import type { ModuleManifest, OverlayComponentLoader } from '@pops/types';

/**
 * Live overlay manifests known to this shell build. Side-effect free — the
 * `component` loader is invoked lazily by `React.lazy` inside `OverlayHost`.
 */
const SHELL_OVERLAY_MANIFESTS: readonly ModuleManifest[] = [egoManifest];

export interface InstalledOverlay {
  readonly moduleId: string;
  readonly chromeSlot: string;
  readonly shortcut: string | undefined;
  readonly loader: OverlayComponentLoader;
}

function projectOverlay(manifest: ModuleManifest): InstalledOverlay | null {
  const overlay = manifest.frontend?.overlay;
  if (overlay === undefined) return null;
  if (overlay.component === undefined) return null;
  return {
    moduleId: manifest.id,
    chromeSlot: overlay.chromeSlot,
    shortcut: overlay.shortcut,
    loader: overlay.component,
  };
}

/**
 * Filter a list of known overlay manifests by an install set. Pure so tests
 * can inject either real `MODULES` ids or a synthetic set to exercise the
 * absent-module path (PRD-101 US-07 acceptance criterion).
 */
export function selectInstalledOverlays(
  manifests: readonly ModuleManifest[],
  installedIds: ReadonlySet<string>
): readonly InstalledOverlay[] {
  const result: InstalledOverlay[] = [];
  for (const m of manifests) {
    if (!installedIds.has(m.id)) continue;
    const projected = projectOverlay(m);
    if (projected !== null) result.push(projected);
  }
  return result;
}

/**
 * Overlay modules that are both registered in this shell build AND in the
 * runtime install set emitted by `@pops/module-registry` (PRD-218 US-01:
 * the `INSTALLED_MODULES` shim re-evaluates `POPS_APPS` / `POPS_OVERLAYS`
 * at module load against the build-time `KNOWN_MODULES` superset).
 */
export const installedOverlays: readonly InstalledOverlay[] = selectInstalledOverlays(
  SHELL_OVERLAY_MANIFESTS,
  new Set(INSTALLED_MODULES)
);

export { SHELL_OVERLAY_MANIFESTS };
