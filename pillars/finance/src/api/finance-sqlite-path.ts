import { dirname, join } from 'node:path';

/**
 * Resolves the finance pillar's `finance.db` location.
 *
 * Resolution order:
 *   1. `FINANCE_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/finance.db` when the shared `SQLITE_PATH`
 *      env is set — a deployer that only sets `SQLITE_PATH` still gets
 *      `finance.db` placed alongside it.
 *   3. `./data/finance.db`.
 */
export const DEFAULT_FINANCE_SQLITE_PATH = './data/finance.db';

export function resolveFinanceSqlitePath(): string {
  const envPath = process.env['FINANCE_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'finance.db');
  return DEFAULT_FINANCE_SQLITE_PATH;
}
