/**
 * Handlers for the `shell.*` sub-router.
 *
 * Wraps the read-only `readInstalledModules` env lookup behind `runHttp`.
 * No db access (the manifest is sourced from `POPS_APPS` / `POPS_OVERLAYS`);
 * the wire shape `{ apps, overlays }` mirrors `core.shell.manifest`.
 */
import { readInstalledModules } from '../env-modules.js';
import { runHttp } from './error-mapping.js';

export function makeShellHandlers() {
  return {
    manifest: () =>
      runHttp(() => {
        const installed = readInstalledModules();
        return {
          status: 200 as const,
          body: { apps: [...installed.apps], overlays: [...installed.overlays] },
        };
      }),
  };
}
