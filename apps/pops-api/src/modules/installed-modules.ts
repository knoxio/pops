/**
 * API-side aggregator that joins the build-time `MODULES` install set
 * (from `@pops/module-registry`) with the live per-module `manifest` exports
 * in this app.
 *
 * The build-time registry intentionally only carries the serialisable
 * projection of each manifest (id, name, surfaces, …) — code-bearing slots
 * live alongside the module they belong to (PRD-101 US-02). Cross-cutting
 * concerns that need the live slots (settings, features, search, …) compose
 * the two halves at the call site through this module.
 *
 * Usage:
 *
 *   import { installedManifests } from '../installed-modules.js';
 *
 *   const features = installedManifests().flatMap(
 *     (m) => m.features ?? []
 *   );
 */
import { MODULES } from '@pops/module-registry';

import { manifest as egoManifest } from './cerebrum/ego/index.js';
import { manifest as cerebrumManifest } from './cerebrum/index.js';
import { manifest as coreManifest } from './core/index.js';
import { manifest as financeManifest } from './finance/index.js';
import { manifest as inventoryManifest } from './inventory/index.js';
import { manifest as mediaManifest } from './media/index.js';

import type { ModuleManifest } from '@pops/types';

/**
 * The full set of backend module manifests in this app. Held as a thunk
 * because the per-module `manifest` exports live in the same dependency
 * tree as the cross-cutting consumers (e.g. `core/features/service.ts`)
 * that read this aggregator — eager initialisation would create import
 * cycles that resolve to `undefined` at module load time. Resolving inside
 * a function defers the lookup until after every module's `index.ts` has
 * finished evaluating.
 *
 * `core` is always included regardless of `POPS_APPS` (PRD-100 contract:
 * core is the platform shell, not a domain module).
 */
function liveManifests(): readonly ModuleManifest[] {
  return [
    coreManifest,
    financeManifest,
    mediaManifest,
    inventoryManifest,
    cerebrumManifest,
    egoManifest,
  ];
}

function liveManifestById(id: string): ModuleManifest | undefined {
  return liveManifests().find((m) => m.id === id);
}

/**
 * Test-only override. When set, `installedManifests()` returns this list
 * verbatim instead of computing from the build-time registry. Must be reset
 * between tests via `__resetInstalledManifestsOverride()`.
 *
 * The override exists because `MODULES` is `as const` literal data emitted
 * at build time — there is no public API for tests to inject synthetic
 * module manifests into it. This shim is the smallest seam that lets unit
 * tests exercise the resolver against arbitrary feature manifests without
 * spinning up the whole module graph.
 */
let testOverride: readonly ModuleManifest[] | null = null;

/**
 * The list of manifests considered "installed" for this process — i.e.
 * present both in `MODULES` (build-time install set) and in the local
 * `LIVE_MANIFESTS` map.
 *
 * Intersection semantics: anything in `MODULES` that has no live
 * counterpart is silently skipped (not an error — frontend-only modules
 * such as `ai` are valid registry entries with no backend manifest).
 */
export function installedManifests(): readonly ModuleManifest[] {
  if (testOverride !== null) return testOverride;

  const out: ModuleManifest[] = [];
  for (const m of MODULES) {
    const live = liveManifestById(m.id);
    if (live !== undefined) out.push(live);
  }
  return out;
}

/**
 * Test-only: replace the installed-manifest source with `manifests`. Pass
 * `null` to restore the production behaviour (read from `MODULES`).
 */
export function __setInstalledManifestsOverride(manifests: readonly ModuleManifest[] | null): void {
  testOverride = manifests;
}

/** Test-only convenience wrapper around `__setInstalledManifestsOverride(null)`. */
export function __resetInstalledManifestsOverride(): void {
  testOverride = null;
}
