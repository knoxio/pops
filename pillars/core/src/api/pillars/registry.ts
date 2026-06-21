/**
 * Pillar registry view served by core-api.
 *
 * Registry-as-truth: the live DB-backed `pillar_registry` table (served by
 * `buildRegistrySnapshot`) is the primary source. `POPS_PILLARS` is demoted to
 * a BOOT SEED / FALLBACK — it pre-populates the mesh during cold-start before
 * pillars have registered, and backfills any known id the registry has no live
 * entry for. A pillar that has registered (DB row) always wins over its seed
 * entry, so a redeployed pillar's fresh `baseUrl` supersedes a stale env value.
 *
 * Adds the synthetic `core` entry so the shell sees the host pillar in the
 * `/pillars` listing without having to special-case the call site.
 */
import { buildRegistrySnapshot } from '../modules/registry/snapshot.js';
import { parseBareOrigin, parsePillarsEnv } from './env.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { CoreDb } from '../../db/index.js';

const SELF_PILLAR_ID = 'core';

let cachedSeed: readonly PillarRegistryEntry[] | undefined;

function seedEntries(): readonly PillarRegistryEntry[] {
  cachedSeed ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  return cachedSeed;
}

/**
 * Live registry entries projected onto the `{ id, baseUrl }` registry shape,
 * keyed by id. The synthetic `core` self-entry is dropped — the caller re-adds
 * it from the live `selfBaseUrl` so the host pillar's advertised origin is
 * never stale.
 */
function liveEntries(db: CoreDb): Map<string, PillarRegistryEntry> {
  const byId = new Map<string, PillarRegistryEntry>();
  for (const pillar of buildRegistrySnapshot(db).pillars) {
    if (pillar.pillarId === SELF_PILLAR_ID) continue;
    byId.set(pillar.pillarId, { id: pillar.pillarId, baseUrl: pillar.baseUrl });
  }
  return byId;
}

/**
 * Merge the live DB registry (primary) with the `POPS_PILLARS` seed (fallback).
 * Registry rows win per-id; the seed only backfills ids the registry has no
 * live entry for. The `core` self-entry is excluded from both — the caller
 * prepends it from `selfBaseUrl`.
 */
function mergedRegistry(db: CoreDb): PillarRegistryEntry[] {
  const live = liveEntries(db);
  // Registry-first ordering: live entries lead, seed-only ids follow. The seed
  // is the fallback, so it MUST NOT shadow a registered pillar — a stale env
  // baseUrl on a redeployed pillar would otherwise misroute cross-pillar calls.
  const merged: PillarRegistryEntry[] = [...live.values()];
  for (const seed of seedEntries()) {
    if (seed.id === SELF_PILLAR_ID) continue;
    if (live.has(seed.id)) continue;
    merged.push(seed);
  }
  return merged;
}

export interface PillarRegistryOptions {
  /** Open handle to the core pillar's SQLite — the live registry source. */
  readonly db: CoreDb;
  /**
   * HTTP origin core-api is reachable at. Required — `server.ts` derives
   * it from `CORE_SELF_BASE_URL` (or falls back to `http://localhost:PORT`)
   * before passing it in. The registry returns this as the synthetic
   * `core` entry's `baseUrl` after normalising it through
   * `parseBareOrigin` so callers can always append `/uri/resolve` etc.
   * without a double-slash or stale path prefix.
   */
  readonly selfBaseUrl: string;
}

export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  const normalisedSelf = parseBareOrigin("core's selfBaseUrl", options.selfBaseUrl);
  return [{ id: SELF_PILLAR_ID, baseUrl: normalisedSelf }, ...mergedRegistry(options.db)];
}

/**
 * Look up a *remote* pillar entry by id, or `undefined` if it is not
 * registered. Prefers the live DB registry and falls back to the
 * `POPS_PILLARS` seed when the registry has no live entry. Used by the URI
 * dispatcher's remote leg to route a cross-pillar URI to its owning process.
 * The synthetic `core` self-entry is intentionally excluded — self-owned URIs
 * always resolve in-process, so the dispatcher never proxies to itself.
 */
export function getRemotePillarEntry(db: CoreDb, id: string): PillarRegistryEntry | undefined {
  if (id === SELF_PILLAR_ID) return undefined;
  const live = liveEntries(db).get(id);
  if (live) return live;
  return seedPillarEntry(id);
}

/**
 * Env-seed-only remote lookup — the DB-less fallback the dispatcher uses when
 * no DB-backed `lookupPillar` is injected. Routes solely off the `POPS_PILLARS`
 * seed (cold-start / DB-unavailable resilience). The `core` self-entry is
 * excluded so the dispatcher never proxies to itself.
 */
export function seedPillarEntry(id: string): PillarRegistryEntry | undefined {
  if (id === SELF_PILLAR_ID) return undefined;
  return seedEntries().find((p) => p.id === id);
}

/** Test-only: forget the cached `POPS_PILLARS` seed so a new value is re-read. */
export function __resetPillarRegistryCache(): void {
  cachedSeed = undefined;
}
