import { dirname, join } from 'node:path';

/**
 * Resolver for the media pillar's SQLite path inside the media-api container.
 *
 * Resolution order:
 *   1. `MEDIA_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/media.db` if `SQLITE_PATH` is set, so a deployer
 *      who only sets the shared path still lands `media.db` in that directory.
 *   3. `./data/media.db`.
 */
export const DEFAULT_MEDIA_SQLITE_PATH = './data/media.db';

export function resolveMediaSqlitePath(): string {
  const envPath = process.env['MEDIA_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'media.db');
  return DEFAULT_MEDIA_SQLITE_PATH;
}
