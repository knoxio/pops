import { ManifestPayloadSchema } from '@pops/pillar-sdk';

import type { PillarSnapshot } from '@pops/pillar-sdk';

/**
 * The last registry snapshot that resolved to a usable shell, kept so a
 * registry outage does not cost the operator every pillar's UI.
 *
 * The shell's offline floor used to be the static bundle map: whatever the
 * build had compiled in was what it mounted when `registry-api` was
 * unreachable. POPS-3215 empties that map one pillar at a time, and with it
 * that floor — at the end of the epic the shell would boot to its own chrome,
 * an empty rail and the settings page (POPS-3239).
 *
 * A registry outage is not a pillar outage. `registry-api` can be down or
 * mid-restart while `finance-api` and its UI bundle are both being served
 * perfectly well — the shell's own nginx serves `/finance-ui/` either way.
 * Losing every pillar's UI to a pillar-*discovery* problem is a worse trade
 * than showing the set that answered last time.
 *
 * So the cache holds the **wire snapshot**, not the resolved surface. The
 * snapshot is JSON the registry sent; the surface holds React components and
 * would not survive `JSON.stringify`. Re-resolving the cached snapshot through
 * the same walk gives each pillar its `assetsBaseUrl` and page slots, exactly
 * as a live snapshot does.
 *
 * **No expiry, deliberately.** A stale entry advertises a pillar that may have
 * gone, and that failure is already contained: the loader wraps every remote
 * page in an error boundary, so a bundle that 404s degrades to a placeholder
 * on that pillar alone. An expiry has the opposite failure — a machine left
 * off for longer than the window boots to the empty shell this exists to
 * prevent. Every successful boot overwrites the entry, so the only way to hold
 * a stale one is to never boot successfully again.
 */

/** Where the snapshot lives. Versioned, so a shape change cannot be misread. */
export const SNAPSHOT_CACHE_KEY = 'pops-registry-snapshot-v1';

/** The subset of `Storage` this module uses; injectable for tests. */
export interface SnapshotStore {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * `localStorage`, or `undefined` where it cannot be reached at all.
 *
 * Touching `localStorage` THROWS rather than returning null in a browser
 * configured to block site data, and the shell has to boot there too — so
 * every access in this module is guarded, not just the ones that parse.
 */
function defaultStore(): SnapshotStore | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Persist a snapshot that resolved to a usable surface.
 *
 * Callers pass only snapshots they have already resolved successfully:
 * caching one that mounted nothing would replace a good floor with a useless
 * one, which is worse than having no cache at all.
 *
 * Never throws. A full quota, a private window, a storage-blocking browser —
 * none of them is a reason to fail a boot that has otherwise succeeded.
 */
export function cacheRegistrySnapshot(
  snapshot: readonly PillarSnapshot[],
  store: SnapshotStore | undefined = defaultStore()
): void {
  if (store === undefined || snapshot.length === 0) return;
  try {
    store.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota, or a browser refusing the write. The shell is already booting.
  }
}

/**
 * The cached snapshot, or `[]` when there is none to use.
 *
 * Every entry is re-validated against `ManifestPayloadSchema` rather than
 * trusted for having been written by this same code: the value survives
 * deploys, so a snapshot written by an older shell can outlive the shape it
 * was written in, and `localStorage` is writable by anything running on the
 * origin. An entry that does not validate is dropped rather than repaired —
 * a half-understood manifest is what produces a pillar that mounts and then
 * fails somewhere further in.
 */
export function readCachedRegistrySnapshot(
  store: SnapshotStore | undefined = defaultStore()
): readonly PillarSnapshot[] {
  if (store === undefined) return [];

  let raw: string | null;
  try {
    raw = store.getItem(SNAPSHOT_CACHE_KEY);
  } catch {
    return [];
  }
  if (raw === null || raw === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearCachedRegistrySnapshot(store);
    return [];
  }
  if (!Array.isArray(parsed)) {
    clearCachedRegistrySnapshot(store);
    return [];
  }

  const valid = parsed.filter(isUsableSnapshotEntry);
  if (valid.length === 0) {
    clearCachedRegistrySnapshot(store);
    return [];
  }
  return valid;
}

/** Drop the cache. Exported so a boot that finds it unusable can say so. */
export function clearCachedRegistrySnapshot(
  store: SnapshotStore | undefined = defaultStore()
): void {
  if (store === undefined) return;
  try {
    store.removeItem(SNAPSHOT_CACHE_KEY);
  } catch {
    // Nothing to do, and nothing worth failing a boot over.
  }
}

/**
 * One cached row, if it is shaped like a registry snapshot entry whose
 * manifest still validates.
 */
function isUsableSnapshotEntry(value: unknown): value is PillarSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as { pillarId?: unknown; manifest?: unknown };
  if (typeof row.pillarId !== 'string' || row.pillarId === '') return false;
  return ManifestPayloadSchema.safeParse(row.manifest).success;
}
