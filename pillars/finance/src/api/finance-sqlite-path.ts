import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the finance pillar's SQLite path inside the
 * finance-api container.
 *
 * Intentionally NOT imported from pops-api — finance-api is supposed to
 * be runnable without pops-api in the dependency graph. The precedence
 * chain mirrors pops-api's resolver verbatim so the two processes agree
 * on the location of `finance.db` given the same env: a deployer who only
 * sets `SQLITE_PATH` (legacy contract) still ends up with `finance.db`
 * next to `pops.db`.
 *
 * Resolution order:
 *   1. `FINANCE_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/finance.db` if the shared path is set.
 *   3. `./data/finance.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_FINANCE_SQLITE_PATH = './data/finance.db';

export function resolveFinanceSqlitePath(): string {
  const envPath = process.env['FINANCE_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'finance.db');
  return DEFAULT_FINANCE_SQLITE_PATH;
}
