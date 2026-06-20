/**
 * Plexus lifecycle-manager resolution for the cerebrum pillar.
 *
 * The monolith kept a process-wide `PlexusLifecycleManager` singleton (the
 * in-memory map of registered adapters is long-lived — one per process). The
 * pillar threads its DB handle through `CerebrumApiDeps`, so the manager is
 * keyed by that handle: the same open `cerebrum.db` reuses one manager (its
 * registered-adapter map survives across requests), while each test's fresh
 * temp DB gets its own manager. A `WeakMap` lets a closed handle's manager be
 * collected with it.
 *
 * The TOML registry / file-watcher (`PlexusRegistry`) that populated the
 * manager at boot in the monolith is intentionally NOT lifted: this slice
 * exposes the REST surface over an empty registry (zero registered adapters),
 * mirroring how the monolith tolerates a missing `plexus.toml`. Adapters are
 * registered out-of-band (or in a later slice), not by this module.
 */
import { PlexusLifecycleManager } from './lifecycle.js';

import type { CerebrumDb } from '../../../db/index.js';

const managers = new WeakMap<object, PlexusLifecycleManager>();

/** Return the lifecycle manager bound to this DB handle, creating it once. */
export function getPlexusLifecycle(db: CerebrumDb): PlexusLifecycleManager {
  const existing = managers.get(db);
  if (existing) return existing;
  const created = new PlexusLifecycleManager(db);
  managers.set(db, created);
  return created;
}
