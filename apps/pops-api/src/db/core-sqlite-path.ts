import { dirname, isAbsolute, join } from 'node:path';

import { DEFAULT_SQLITE_PATH } from './sqlite-path.js';

/**
 * Default location of the core pillar's SQLite file.
 *
 * Per the ADR-026 pillar architecture each pillar owns its own SQLite
 * file alongside the shared pops.db. The default places `core.db` in the
 * same `./data/` directory the shared singleton uses so a single
 * `mkdir -p data && pnpm dev` covers both files. Production deployments
 * set `CORE_SQLITE_PATH` explicitly; the fallback here is local-dev-only.
 *
 * Resolution order:
 *   1. `CORE_SQLITE_PATH` env (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/core.db` if the shared path is set.
 *   3. `./data/core.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_CORE_SQLITE_PATH = './data/core.db';

export function resolveCoreSqlitePath(): string {
  const envPath = process.env['CORE_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) {
    const dir = dirname(sharedPath);
    return isAbsolute(sharedPath) ? join(dir, 'core.db') : join(dir, 'core.db');
  }
  console.warn(
    `[db] CORE_SQLITE_PATH not set — using fallback: ${DEFAULT_CORE_SQLITE_PATH} ` +
      `(co-located with the shared singleton default '${DEFAULT_SQLITE_PATH}')`
  );
  return DEFAULT_CORE_SQLITE_PATH;
}
