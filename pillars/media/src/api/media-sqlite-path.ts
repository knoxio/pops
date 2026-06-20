import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the media pillar's SQLite path inside the
 * media-api container.
 *
 * Intentionally NOT imported from pops-api — media-api is supposed to be
 * runnable without pops-api in the dependency graph. The precedence chain
 * mirrors pops-api's resolver verbatim so the two processes agree on the
 * location of `media.db` given the same env: a deployer who only sets
 * `SQLITE_PATH` (legacy contract) still ends up with `media.db` next to
 * `pops.db`.
 *
 * Resolution order:
 *   1. `MEDIA_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/media.db` if the shared path is set.
 *   3. `./data/media.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_MEDIA_SQLITE_PATH = './data/media.db';

export function resolveMediaSqlitePath(): string {
  const envPath = process.env['MEDIA_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'media.db');
  return DEFAULT_MEDIA_SQLITE_PATH;
}
