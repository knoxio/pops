/**
 * Standalone resolver for the core pillar's SQLite path inside the
 * core-api container.
 *
 * Intentionally NOT imported from `apps/pops-api/src/db/core-sqlite-path.ts`
 * — core-api is supposed to be runnable without pops-api in the
 * dependency graph. The shared default is the same (`./data/core.db`)
 * and the env var name (`CORE_SQLITE_PATH`) matches, so an operator
 * who points both processes at the same path gets a consistent view.
 */
export const DEFAULT_CORE_SQLITE_PATH = './data/core.db';

export function resolveCoreSqlitePath(): string {
  const envPath = process.env['CORE_SQLITE_PATH'];
  if (envPath) return envPath;
  return DEFAULT_CORE_SQLITE_PATH;
}
