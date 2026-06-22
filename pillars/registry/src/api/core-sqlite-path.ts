import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the registry pillar's SQLite path inside the
 * registry-api container.
 *
 * The pillar was renamed core→registry; the on-disk DB is being renamed
 * `core.db`→`registry.db` in lockstep. During the rename window the legacy
 * `CORE_SQLITE_PATH` env is still honoured (the live compose sets it) so the
 * image is deploy-safe BEFORE the file is renamed; once the deployer renames
 * the file and sets `REGISTRY_SQLITE_PATH`, that wins.
 *
 * Resolution order:
 *   1. `REGISTRY_SQLITE_PATH` (absolute or relative) — the post-rename env.
 *   2. `CORE_SQLITE_PATH` — legacy, retained for the rename window.
 *   3. `<dirname(SQLITE_PATH)>/registry.db` if the shared path is set.
 *   4. `./data/registry.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_REGISTRY_SQLITE_PATH = './data/registry.db';

export function resolveCoreSqlitePath(): string {
  const registryPath = process.env['REGISTRY_SQLITE_PATH'];
  if (registryPath) return registryPath;
  const corePath = process.env['CORE_SQLITE_PATH'];
  if (corePath) return corePath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'registry.db');
  return DEFAULT_REGISTRY_SQLITE_PATH;
}
