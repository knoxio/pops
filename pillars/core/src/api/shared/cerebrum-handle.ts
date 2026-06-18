/**
 * Lazily-opened cerebrum drizzle handle for the core pillar container.
 *
 * The ai-alerts nudge dispatcher writes an `nudge_log` row to the
 * **cerebrum** DB (a separate SQLite file from `core.db`). In the
 * monolith this handle is resolved via `apps/pops-api`'s internal
 * `db/cerebrum-handle.ts`, which is not importable across the app
 * boundary. This module re-creates the minimal slice: it opens
 * `@pops/cerebrum-db`'s `openCerebrumDb` against a pillar-resolved path
 * and caches the handle.
 *
 * NOTE (core-pillar runbook — "rewire ai-alerts cerebrum read" / C4):
 * the live `@pops/cerebrum-db` workspace import is kept AS-IS for now.
 * A later slice rewires this cross-pillar write to the cerebrum REST
 * SDK; until then the core container opens its own cerebrum.db handle.
 */
import { dirname, join } from 'node:path';

import { openCerebrumDb, type CerebrumDb, type OpenedCerebrumDb } from '@pops/cerebrum-db';

export const DEFAULT_CEREBRUM_SQLITE_PATH = './data/cerebrum.db';

/**
 * Resolve the cerebrum SQLite path. Mirrors pops-api's resolver so the
 * core container and the cerebrum container agree on the file location
 * given the same env.
 *
 * Resolution order:
 *   1. `CEREBRUM_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/cerebrum.db` if the shared path is set.
 *   3. `./data/cerebrum.db`.
 */
export function resolveCerebrumSqlitePath(): string {
  const envPath = process.env['CEREBRUM_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'cerebrum.db');
  return DEFAULT_CEREBRUM_SQLITE_PATH;
}

let cerebrumDb: OpenedCerebrumDb | null = null;

/** Resolve (and lazily open) the cerebrum pillar's drizzle handle. */
export function getCerebrumDrizzle(): CerebrumDb {
  if (!cerebrumDb) {
    cerebrumDb = openCerebrumDb(resolveCerebrumSqlitePath());
  }
  return cerebrumDb.db;
}
