import { WORKSPACE_BUNDLE_MAP, type BundleEntry, type CaptureOverlayBundle } from '../bundle-map';
/**
 * Capture-overlay registry walk (PRD-246 US-03).
 *
 * Projects `installedFrontendManifests()` onto the
 * `frontend.captureOverlay` dimension, applies the selection rule from
 * the spec (sort ascending by `order`, ties broken alphabetically by
 * pillar id, pick head), and resolves the descriptor's `bundleSlot`
 * through the workspace bundle map to obtain the React component the
 * shell's `CaptureModal` will mount.
 *
 * Failure modes mirror PRD-243 US-03's `pages` resolution edge cases:
 *
 *   - No manifest contributes a `captureOverlay` → returns `null`; the
 *     modal renders an empty state (`captureModal.empty`).
 *   - The descriptor's `bundleSlot` cannot be resolved against the
 *     workspace bundle map → logs a structured warning and returns
 *     `null`, falling back to the empty-state path.
 *
 * The selection rule + resolver are exported so the unit tests can
 * exercise them against synthetic manifests + bundle maps without
 * touching the live registry.
 */
import { installedFrontendManifests, type FrontendManifest } from '../installed-modules';

import type { ModuleCaptureOverlayConfig } from '@pops/types';

export interface RankedCaptureOverlay {
  readonly pillarId: string;
  readonly descriptor: ModuleCaptureOverlayConfig;
}

export interface ActiveCaptureOverlay {
  readonly pillarId: string;
  readonly descriptor: ModuleCaptureOverlayConfig;
  readonly bundle: CaptureOverlayBundle;
}

function descriptorFromManifest(
  manifest: FrontendManifest
): ModuleCaptureOverlayConfig | undefined {
  return manifest.frontend?.captureOverlay;
}

function compareRanked(a: RankedCaptureOverlay, b: RankedCaptureOverlay): number {
  if (a.descriptor.order !== b.descriptor.order) {
    return a.descriptor.order - b.descriptor.order;
  }
  if (a.pillarId === b.pillarId) return 0;
  return a.pillarId < b.pillarId ? -1 : 1;
}

/**
 * Selection rule from the spec. Exported for unit tests.
 *
 * Returns every manifest whose `frontend.captureOverlay` is defined,
 * sorted ascending by `order` with ties broken alphabetically by
 * `pillarId`. The shell consumes only the head element today — the
 * full list is exposed so the spec's "duplicate hotkey" warning has
 * the full set to diff against (handled in `useCaptureOverlay`).
 */
export function rankCaptureOverlays(
  manifests: readonly FrontendManifest[]
): readonly RankedCaptureOverlay[] {
  const ranked: RankedCaptureOverlay[] = [];
  for (const manifest of manifests) {
    const descriptor = descriptorFromManifest(manifest);
    if (descriptor === undefined) continue;
    ranked.push({ pillarId: manifest.id, descriptor });
  }
  ranked.sort(compareRanked);
  return ranked;
}

/**
 * Resolve a ranked descriptor against the workspace bundle map. Logs a
 * structured warning and returns `null` when the descriptor names a
 * `bundleSlot` no entry maps. Exported for unit tests.
 */
export function resolveCaptureOverlay(
  ranked: RankedCaptureOverlay,
  bundleMap: Readonly<Record<string, BundleEntry>>
): ActiveCaptureOverlay | null {
  const entry = bundleMap[ranked.pillarId];
  const bundles = entry?.captureOverlayBundles;
  const bundle = bundles?.[ranked.descriptor.bundleSlot];
  if (bundle === undefined) {
    console.warn(
      `[capture-registry] unknown capture overlay bundleSlot; skipping mount (pillarId=${ranked.pillarId}, bundleSlot=${ranked.descriptor.bundleSlot})`
    );
    return null;
  }
  return { pillarId: ranked.pillarId, descriptor: ranked.descriptor, bundle };
}

/**
 * The head of the ranked list, resolved against the workspace bundle
 * map. Returns `null` (and logs a `debug` line) when no manifest
 * contributes a `captureOverlay` — the modal renders the empty-state
 * surface in that case.
 *
 * Exported for unit tests; the live consumer is `useCaptureOverlay()`
 * which threads the same call through React and additionally emits the
 * duplicate-hotkey warning across the full ranked list.
 */
export function selectActiveCaptureOverlay(
  manifests: readonly FrontendManifest[],
  bundleMap: Readonly<Record<string, BundleEntry>>
): ActiveCaptureOverlay | null {
  const ranked = rankCaptureOverlays(manifests);
  const head = ranked[0];
  if (head === undefined) {
    console.warn('[capture-registry] no capture overlay registered');
    return null;
  }
  return resolveCaptureOverlay(head, bundleMap);
}

/**
 * Emit a structured warning when two or more ranked overlays share the
 * same hotkey. Spec: only the active (head) overlay's hotkey is bound;
 * the inactive overlays still have their hotkeys declared, so the
 * conflict is worth surfacing even though the binding itself is safe.
 */
export function warnOnDuplicateHotkeys(ranked: readonly RankedCaptureOverlay[]): void {
  const seen = new Map<string, string[]>();
  for (const entry of ranked) {
    const hotkey = entry.descriptor.hotkey;
    if (hotkey === undefined) continue;
    const list = seen.get(hotkey) ?? [];
    list.push(entry.pillarId);
    seen.set(hotkey, list);
  }
  for (const [hotkey, pillars] of seen) {
    if (pillars.length < 2) continue;
    console.warn(
      `[capture-registry] duplicate captureOverlay hotkey '${hotkey}' across pillars: ${pillars.join(', ')}; only '${pillars[0]}' binds`
    );
  }
}

/**
 * Live registry walk: head of `installedFrontendManifests()` projected
 * onto `frontend.captureOverlay`, resolved against the workspace bundle
 * map. The default consumer of the helpers above.
 */
export function activeCaptureOverlay(): ActiveCaptureOverlay | null {
  const manifests = installedFrontendManifests();
  const ranked = rankCaptureOverlays(manifests);
  warnOnDuplicateHotkeys(ranked);
  const head = ranked[0];
  if (head === undefined) {
    console.warn('[capture-registry] no capture overlay registered');
    return null;
  }
  return resolveCaptureOverlay(head, WORKSPACE_BUNDLE_MAP);
}
