/**
 * Engram-root resolution for the cerebrum pillar.
 *
 * The engram root is the directory holding the Markdown source files (the
 * SQLite index is a regenerable cache of it). It is process-scoped config, so
 * the server resolves it once at boot and threads it through
 * `CerebrumApiDeps`. `CEREBRUM_ENGRAMS_DIR` overrides the default; the default
 * mirrors the monolith's `data/engrams` layout under the process cwd.
 */
import { join } from 'node:path';

export const ENGRAM_ROOT_ENV = 'CEREBRUM_ENGRAMS_DIR';

/** Resolve the engram root directory from the environment, with a default. */
export function resolveEngramRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[ENGRAM_ROOT_ENV];
  if (configured !== undefined && configured !== '') return configured;
  return join(process.cwd(), 'data', 'engrams');
}
