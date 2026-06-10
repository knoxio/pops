import { dirname, join } from 'node:path';

/**
 * Default location of the cerebrum pillar's SQLite file inside the
 * dedicated `pops-cerebrum-api` container.
 *
 * Inside the container the operator-provided path normally lives under
 * `/data/sqlite/cerebrum.db`. The fallback used here matches the pops-
 * api convention so local dev (mise + tsx watch) keeps working without
 * any extra config.
 *
 * Resolution order:
 *   1. `CEREBRUM_SQLITE_PATH` env (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/cerebrum.db` if the shared path is set
 *      (deployers that share a single env file across pops-api and
 *      cerebrum-api still get a sensible co-located path).
 *   3. `./data/cerebrum.db`.
 */
export const DEFAULT_CEREBRUM_API_SQLITE_PATH = './data/cerebrum.db';

export function resolveCerebrumSqlitePath(): string {
  const envPath = process.env['CEREBRUM_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'cerebrum.db');
  console.warn(
    `[cerebrum-api] CEREBRUM_SQLITE_PATH not set — using fallback: ${DEFAULT_CEREBRUM_API_SQLITE_PATH}`
  );
  return DEFAULT_CEREBRUM_API_SQLITE_PATH;
}
