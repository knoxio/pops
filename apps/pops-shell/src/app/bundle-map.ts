/**
 * Workspace bundle map — single source enumerating in-repo pillar ids in the
 * shell (PRD-243 US-03).
 *
 * The shell discovers each in-repo pillar's UI surface (nav + pages) by
 * walking this map. For external pillars (PRD-228) the registry will
 * advertise an `assetsBaseUrl`; the lazy-load mechanism is gated on US-05
 * landing — until then any external-only pillar id falls through the
 * `external UI loading not implemented` skip path in `installed-modules.ts`.
 *
 * Each entry carries:
 *
 *   - `manifest`        — the frontend `ModuleManifest` re-exported by the
 *                         pillar's `@pops/app-*` workspace package. Provides
 *                         `frontend.routes` (lazy `RouteObject[]`) and the
 *                         legacy `navConfig` the shell still uses to render
 *                         the app rail. Bound by static import because the
 *                         current shell consumer surface is synchronous.
 *   - `navOrder`        — mirrors `nav.order` from the pillar's wire-format
 *                         manifest payload (`apps/pops-<id>-api/src/manifest.ts`).
 *                         Values follow the reconciled sparse scheme
 *                         (finance=10, media=20, inventory=30, food=40,
 *                         lists=50, cerebrum=60, ai=70) so the app rail
 *                         renders the same seven entries in the same order
 *                         as the pre-PR `registeredApps` literal.
 *   - `assetsBaseUrl?`  — reserved for external pillars (US-05). Always
 *                         `undefined` for in-repo entries today.
 *
 * Adding a new in-repo pillar = adding one entry here. External pillars
 * never appear in this map; they reach the shell via the registry walk and
 * (once US-05 lands) the asset-URL loading path.
 */
import { manifest as aiManifest } from '@pops/app-ai';
import { manifest as cerebrumManifest } from '@pops/app-cerebrum';
import { manifest as financeManifest } from '@pops/app-finance';
import { manifest as foodManifest } from '@pops/app-food';
import { manifest as inventoryManifest } from '@pops/app-inventory';
import { manifest as listsManifest } from '@pops/app-lists';
import { manifest as mediaManifest } from '@pops/app-media';
import { manifest as egoManifest } from '@pops/overlay-ego';

import type { ModuleManifest } from '@pops/types';

export interface BundleEntry {
  readonly manifest: ModuleManifest;
  readonly navOrder: number;
  readonly assetsBaseUrl?: string;
}

export const WORKSPACE_BUNDLE_MAP: Readonly<Record<string, BundleEntry>> = {
  finance: { manifest: financeManifest, navOrder: 10 },
  media: { manifest: mediaManifest, navOrder: 20 },
  inventory: { manifest: inventoryManifest, navOrder: 30 },
  food: { manifest: foodManifest, navOrder: 40 },
  lists: { manifest: listsManifest, navOrder: 50 },
  cerebrum: { manifest: cerebrumManifest, navOrder: 60 },
  ai: { manifest: aiManifest, navOrder: 70 },
  ego: { manifest: egoManifest, navOrder: Number.POSITIVE_INFINITY },
};

export function lookupBundleEntry(pillarId: string): BundleEntry | undefined {
  return WORKSPACE_BUNDLE_MAP[pillarId];
}
