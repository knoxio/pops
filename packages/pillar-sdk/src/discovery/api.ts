import { getRegistrySnapshot } from './cache.js';

import type { PillarSnapshot, RegistrySnapshot } from './types.js';

/**
 * Returns the manifest snapshot for one pillar, or `undefined` if it's
 * not registered. First call may await a network fetch; subsequent
 * calls within the TTL window are served from the in-process cache.
 *
 * Throws {@link RegistryUnreachableError} only when the cache is empty
 * AND the registry can't be reached. If the cache holds anything (even
 * stale), that is returned in preference to throwing.
 */
export async function lookupPillar(pillarId: string): Promise<PillarSnapshot | undefined> {
  const snapshot = await getRegistrySnapshot();
  return snapshot.pillars.find((p) => p.pillarId === pillarId);
}

/**
 * Returns the full registry snapshot. Same caching + fallback semantics
 * as {@link lookupPillar}.
 */
export async function pillarRegistry(): Promise<RegistrySnapshot> {
  return getRegistrySnapshot();
}
