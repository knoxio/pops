/**
 * Reflex service accessor for the cerebrum pillar (PRD-089).
 *
 * The {@link ReflexService} is config-dependent (reads `reflexes.toml`) and
 * holds in-memory threshold state, so it is cached per DB handle rather than
 * rebuilt on each request. The config path is env-configurable and a missing
 * file is tolerated (empty reflex set) so the pillar boots without any TOML.
 *
 * Resolution order for the config file:
 *   1. `CEREBRUM_REFLEX_CONFIG` — an explicit path to `reflexes.toml`.
 *   2. `CEREBRUM_REFLEX_CONFIG_DIR` (or `ENGRAM_ROOT`) — a directory whose
 *      `.config/reflexes.toml` is used (parity with the monolith's engram
 *      root layout).
 *   3. A safe default under the cwd that almost certainly does not exist,
 *      yielding an empty reflex set.
 */
import { join } from 'node:path';

import { ReflexService } from './reflex-service.js';

import type { CerebrumDb } from '../../../db/index.js';

/** Resolve the absolute path to `reflexes.toml` from the environment. */
export function resolveReflexConfigPath(): string {
  const explicit = process.env['CEREBRUM_REFLEX_CONFIG'];
  if (explicit && explicit.length > 0) return explicit;

  const dir = process.env['CEREBRUM_REFLEX_CONFIG_DIR'] ?? process.env['ENGRAM_ROOT'];
  if (dir && dir.length > 0) return join(dir, '.config', 'reflexes.toml');

  return join(process.cwd(), 'engrams', '.config', 'reflexes.toml');
}

const cache = new WeakMap<CerebrumDb, ReflexService>();

/**
 * Return a started {@link ReflexService} bound to `db`, constructing (and
 * caching) it on first access. The hot-reload watcher is enabled by default
 * so an operator editing the TOML at runtime is picked up; pass `watch: false`
 * to opt out (tests do this implicitly via {@link buildReflexService}).
 */
export function getReflexService(db: CerebrumDb): ReflexService {
  const cached = cache.get(db);
  if (cached) return cached;

  const service = buildReflexService({ db, configPath: resolveReflexConfigPath(), watch: true });
  cache.set(db, service);
  return service;
}

/** Construct and start a {@link ReflexService} without touching the cache. */
export function buildReflexService(options: {
  db: CerebrumDb;
  configPath: string;
  watch?: boolean;
}): ReflexService {
  const service = new ReflexService(options);
  service.start();
  return service;
}
