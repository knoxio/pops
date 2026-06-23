/**
 * Module-id projection.
 *
 * Historically this file carried a closed `ALL_MODULE_IDS` tuple and the
 * `ModuleId` union derived from it (pillars + the transitional `ego`
 * sub-module). RD-9 (POPS federation) widened the type tier to `string` so
 * the registry is the sole source of truth for which modules exist; the
 * frozen tuple, its `isModuleId` guard, and the `MODULE_PARENT_PILLAR` table
 * were retired in the same pass.
 *
 * Runtime "is this a module the build curates?" checks live in
 * `@pops/module-registry` (`KNOWN_MODULES` / `isInstalledModule`), which is
 * disk-discovered and per-deploy gated. Parent-pillar dispatch lives in the
 * shell's `pillarIdForModule` (`pillars/shell/src/app/pillars.ts`). The only
 * surviving member here is `isKnownPillarId`, the narrowing seam against the
 * curated `PILLARS` value.
 */

import { PILLARS, type KnownPillarId, type PillarId } from './known-pillar-id.js';

/**
 * Routable module id — an alias of the open {@link PillarId}.
 *
 * Was a closed union over `pillars + {ego}`; now `string`, so a module id the
 * build has never compiled against (a runtime/registry/LAN registration) is
 * expressible without a type edit. Membership in the build's curated set is a
 * runtime question answered by `@pops/module-registry`.
 */
export type ModuleId = PillarId;

/**
 * Runtime type guard narrowing an arbitrary string to `KnownPillarId` by
 * membership of the curated {@link PILLARS} value. Use at the boundary of
 * untyped inputs (URL params, env vars, untyped REST inputs) when a build-time
 * surface needs to know whether the id is one of the in-tree pillars.
 */
export function isKnownPillarId(id: string): id is KnownPillarId {
  return (PILLARS as readonly string[]).includes(id);
}
