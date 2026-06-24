import { useEffect } from 'react';

/**
 * Workspace bundle map — single source enumerating in-repo pillar ids in the
 * shell.
 *
 * The shell discovers each in-repo pillar's UI surface (nav + pages +
 * capture overlay) by walking this map. For external pillars the registry
 * advertises an `assetsBaseUrl` and the wire-shaped `nav` / `pages`
 * descriptors; those never appear in this map (ADR-002 keeps the in-repo FE
 * a single static SPA). They reach the shell through the runtime loader in
 * `external-ui.tsx`, which lazy-`import()`s the remote bundle (Option A).
 *
 * Each entry carries:
 *
 *   - `manifest`              — the frontend `ModuleManifest` re-exported
 *                               by the pillar's `@pops/app-*` workspace
 *                               package. Provides `frontend.routes`
 *                               (lazy `RouteObject[]`), `navConfig`, and the
 *                               `frontend.captureOverlay` descriptor.
 *                               Bound by static import because the
 *                               current shell consumer surface is
 *                               synchronous.
 *   - `navOrder`              — mirrors `nav.order` from the pillar's
 *                               wire-format manifest payload
 *                               (`pillars/<id>/src/api/manifest.ts`).
 *                               Values follow the sparse scheme (finance=10,
 *                               media=20, inventory=30, food=40, lists=50,
 *                               cerebrum=60, ai=70) so the app rail renders
 *                               the seven entries in that order.
 *   - `captureOverlayBundles` — kebab-case bundle slot → component +
 *                               (optional) hook reference. The shell's
 *                               `CaptureModal` resolves
 *                               `manifest.frontend.captureOverlay.bundleSlot`
 *                               through this record to obtain the React
 *                               component to mount. Cerebrum binds
 *                               `'ingest-form'` to its `IngestForm` +
 *                               `useIngestPageModel`.
 *   - `assetsBaseUrl?`        — set only for synthesized external-pillar
 *                               entries (`external-ui.tsx`); echoed for
 *                               diagnostics. Always `undefined` for the
 *                               in-repo entries declared in this file.
 *
 * Adding a new in-repo pillar = adding one entry here. External pillars
 * never appear in this map; they reach the shell via the registry walk and
 * the asset-URL loading path in `external-ui.tsx`.
 */
import { manifest as aiManifest } from '@pops/app-ai';
import { IngestForm, manifest as cerebrumManifest, useIngestPageModel } from '@pops/app-cerebrum';
import { manifest as financeManifest } from '@pops/app-finance';
import { manifest as foodManifest } from '@pops/app-food';
import { manifest as inventoryManifest } from '@pops/app-inventory';
import { manifest as listsManifest } from '@pops/app-lists';
import { manifest as mediaManifest } from '@pops/app-media';
import { manifest as egoManifest } from '@pops/overlay-ego';

import type { ComponentType } from 'react';

import type { ModuleManifest } from '@pops/types';

/**
 * Fires the parent's `onUnsavedChange` callback whenever the bundle's
 * internal unsaved-content state flips. Mount bundles call this from
 * their render bodies so the modal stays informed without coupling the
 * model type up to the shell.
 */
function useUnsavedSignal(hasUnsaved: boolean, onChange: (next: boolean) => void): void {
  useEffect(() => {
    onChange(hasUnsaved);
  }, [hasUnsaved, onChange]);
}

/**
 * Props the shell passes to every capture-overlay `Mount` component.
 * `onUnsavedChange` flips whenever the bundle's unsaved-state changes
 * so the shell can gate Esc / backdrop close gestures without having to
 * peek inside bundle-local React state. Bundles that have no notion of
 * "unsaved content" simply never call the callback (the modal then
 * always permits close).
 */
export interface CaptureOverlayMountProps {
  readonly onUnsavedChange: (hasUnsaved: boolean) => void;
}

/**
 * One capture-overlay binding. The shell mounts `<Mount />` — a
 * zero-config wrapper a bundle owns that internally invokes its hook
 * and threads the model into its component. The wrapper shape lets each
 * pillar choose its own component / hook contract (cerebrum's
 * `<IngestForm model={useIngestPageModel()} />` shape included) without
 * leaking model types up to the shell.
 */
export interface CaptureOverlayBundle {
  readonly Mount: ComponentType<CaptureOverlayMountProps>;
}

export interface BundleEntry {
  readonly manifest: ModuleManifest;
  readonly navOrder: number;
  readonly captureOverlayBundles?: Readonly<Record<string, CaptureOverlayBundle>>;
  readonly assetsBaseUrl?: string;
}

function CerebrumIngestFormMount({ onUnsavedChange }: CaptureOverlayMountProps) {
  const model = useIngestPageModel();
  const hasUnsaved = model.form.body.length > 0 && !model.bulkResults && !model.submitResult;
  useUnsavedSignal(hasUnsaved, onUnsavedChange);
  return <IngestForm model={model} />;
}

const CEREBRUM_INGEST_FORM_BUNDLE: CaptureOverlayBundle = {
  Mount: CerebrumIngestFormMount,
};

export const WORKSPACE_BUNDLE_MAP: Readonly<Record<string, BundleEntry>> = {
  finance: { manifest: financeManifest, navOrder: 10 },
  media: { manifest: mediaManifest, navOrder: 20 },
  inventory: { manifest: inventoryManifest, navOrder: 30 },
  food: { manifest: foodManifest, navOrder: 40 },
  lists: { manifest: listsManifest, navOrder: 50 },
  cerebrum: {
    manifest: cerebrumManifest,
    navOrder: 60,
    captureOverlayBundles: {
      'ingest-form': CEREBRUM_INGEST_FORM_BUNDLE,
    },
  },
  ai: { manifest: aiManifest, navOrder: 70 },
  ego: { manifest: egoManifest, navOrder: Number.POSITIVE_INFINITY },
};

export function lookupBundleEntry(pillarId: string): BundleEntry | undefined {
  return WORKSPACE_BUNDLE_MAP[pillarId];
}
