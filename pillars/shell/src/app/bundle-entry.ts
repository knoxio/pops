/**
 * What a mounted pillar contributes to the shell, and the props the shell
 * passes back into one of its surfaces.
 *
 * Every pillar is now resolved from the live registry and its bundle imported
 * at runtime (POPS-3215), so nothing here is a compile-time enumeration —
 * these are the shapes `external-ui.tsx` synthesizes per pillar and the
 * registries look a slot up in. The file they used to live in,
 * `bundle-map.tsx`, existed to hold the static list beside them; POPS-3227
 * removed that list, so the types moved rather than being deleted with it.
 */
import type { ComponentType } from 'react';

import type { ModuleManifest } from '@pops/types';

/**
 * Props the shell passes to every capture-overlay `Mount` component.
 *
 * `onUnsavedChange` flips whenever the bundle's unsaved-state changes so the
 * shell can gate Esc / backdrop close gestures without having to peek inside
 * bundle-local React state. Bundles with no notion of "unsaved content"
 * simply never call it, and the modal then always permits close.
 */
export interface CaptureOverlayMountProps {
  readonly onUnsavedChange: (hasUnsaved: boolean) => void;
}

/**
 * One capture-overlay binding. The shell mounts `<Mount />` — a zero-config
 * wrapper the pillar owns, which internally invokes its own hook and threads
 * the model into its component. The wrapper shape lets each pillar choose its
 * component/hook contract without leaking model types up to the shell.
 */
export interface CaptureOverlayBundle {
  readonly Mount: ComponentType<CaptureOverlayMountProps>;
}

/**
 * A pillar's resolved UI surface: the manifest its routes come from, where it
 * sits on the rail, and the non-page surfaces it supplies, each keyed by the
 * bundle slot its wire manifest names.
 */
export interface BundleEntry {
  readonly manifest: ModuleManifest;
  readonly navOrder: number;
  readonly captureOverlayBundles?: Readonly<Record<string, CaptureOverlayBundle>>;
  readonly settingsWidgetBundles?: Readonly<Record<string, ComponentType>>;
  readonly assetsBaseUrl?: string;
}
