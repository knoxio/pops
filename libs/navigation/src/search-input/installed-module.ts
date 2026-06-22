/**
 * Defence-in-depth filter for cross-domain search results (PRD-101 US-06).
 *
 * The backend search engine sources adapters from the build-time `MODULES`
 * install set, so it should never emit a section whose owning module is
 * absent. This helper repeats the check on the frontend so an out-of-sync
 * build, a stale cache, or a future code path that bypasses the engine still
 * can't render results that link into a module the shell doesn't mount.
 */
import { isModuleId } from '@pops/pillar-sdk';

/**
 * `registry` (formerly `core`) is the always-mounted platform module
 * (PRD-100). `isModuleId` checks membership of the static `ALL_MODULE_IDS`
 * superset (pillars plus the two transitional sub-modules `ai`/`ego`), so
 * `registry` is already covered; the explicit branch is kept for clarity at
 * the call boundary.
 */
export function isInstalledModule(moduleId: string): boolean {
  return moduleId === 'registry' || isModuleId(moduleId);
}
