/**
 * Defence-in-depth filter for cross-domain search results (PRD-101 US-06).
 *
 * The backend search engine sources adapters from the build-time `MODULES`
 * install set, so it should never emit a section whose owning module is
 * absent. This helper repeats the check on the frontend so an out-of-sync
 * build, a stale cache, or a future code path that bypasses the engine still
 * can't render results that link into a module the shell doesn't mount.
 *
 * RD-9 (POPS federation) re-homed this off the SDK's frozen `isModuleId`
 * (which the type-widening turned into an always-true guard) onto
 * `@pops/module-registry`'s runtime install-set check. That set is
 * disk-discovered and `POPS_APPS`-gated, so the filter still rejects sections
 * for modules absent from this deploy — the semantic the SDK guard could no
 * longer carry once `ModuleId` became `string`.
 */
import { isInstalledModule as isInstalledModuleId } from '@pops/module-registry';

/**
 * True when `moduleId` is in the build's runtime install set. `registry`
 * (formerly `core`) is the always-mounted platform module (PRD-100) and is
 * covered by the registry's `ALWAYS_INSTALLED` floor, so no explicit branch
 * is needed here.
 */
export function isInstalledModule(moduleId: string): boolean {
  return isInstalledModuleId(moduleId);
}
