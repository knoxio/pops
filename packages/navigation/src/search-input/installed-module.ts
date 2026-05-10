/**
 * Defence-in-depth filter for cross-domain search results (PRD-101 US-06).
 *
 * The backend search engine sources adapters from the build-time `MODULES`
 * install set, so it should never emit a section whose owning module is
 * absent. This helper repeats the check on the frontend so an out-of-sync
 * build, a stale cache, or a future code path that bypasses the engine still
 * can't render results that link into a module the shell doesn't mount.
 */
import { isModuleId } from '@pops/module-registry';

/**
 * `core` is the always-mounted shell module (PRD-100) — its id is not in the
 * `MODULES` constant (which lists optional modules), so the filter exempts
 * it explicitly. Any other id must pass `isModuleId`.
 */
export function isInstalledModule(moduleId: string): boolean {
  return moduleId === 'core' || isModuleId(moduleId);
}
