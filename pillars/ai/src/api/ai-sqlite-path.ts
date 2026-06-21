import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the ai pillar's SQLite path inside the ai-api
 * container.
 *
 * The precedence chain mirrors the other pillars' resolvers so processes agree
 * on the location of `ai.db` given the same env: a deployer who only sets the
 * shared `SQLITE_PATH` still ends up with `ai.db` next to it.
 *
 * Resolution order:
 *   1. `AI_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/ai.db` if the shared path is set.
 *   3. `./data/ai.db`.
 */
export const DEFAULT_AI_SQLITE_PATH = './data/ai.db';

export function resolveAiSqlitePath(): string {
  const envPath = process.env['AI_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'ai.db');
  return DEFAULT_AI_SQLITE_PATH;
}
