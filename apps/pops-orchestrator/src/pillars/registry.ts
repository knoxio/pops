/**
 * Pillar registry view served by the orchestrator.
 *
 * Registry-as-truth: `resolvePillarRegistry` reads the live DB-backed registry
 * snapshot (via the pillar SDK's discovery client) as the primary source and
 * falls back to the `POPS_PILLARS` boot seed. A registered pillar (snapshot
 * entry) wins over its seed entry, so a redeployed pillar's fresh `baseUrl`
 * supersedes a stale env value. When the registry is unreachable and nothing is
 * cached, the seed alone keeps the federation view working (cold-start / outage
 * resilience).
 *
 * The synthetic `orchestrator` self-entry is always prepended so a consumer
 * sees the federating service alongside the pillars it aggregates over.
 */
import { pillarRegistry, RegistryUnreachableError } from '@pops/pillar-sdk/discovery';

import { parseBareOrigin, parsePillarsEnv } from './env.js';

import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';
import type { PillarRegistryEntry } from '@pops/types';

export const ORCHESTRATOR_PILLAR_ID = 'orchestrator' as const;

let cachedSeed: readonly PillarRegistryEntry[] | undefined;

function seedEntries(): readonly PillarRegistryEntry[] {
  cachedSeed ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  return cachedSeed;
}

export interface PillarRegistryOptions {
  /**
   * HTTP origin the orchestrator is reachable at. Required — `server.ts`
   * derives it from `ORCHESTRATOR_SELF_BASE_URL` (or falls back to
   * `http://localhost:PORT`) before passing it in. Returned as the
   * synthetic `orchestrator` entry's `baseUrl` after normalising it
   * through `parseBareOrigin`.
   */
  readonly selfBaseUrl: string;
}

/**
 * Reads the live registry snapshot. Defaults to the SDK discovery client; tests
 * inject a stub so they neither hit the network nor depend on the process-wide
 * discovery cache.
 */
export type RegistrySnapshotReader = () => Promise<readonly PillarSnapshot[]>;

const defaultSnapshotReader: RegistrySnapshotReader = async () => {
  const snapshot = await pillarRegistry();
  return snapshot.pillars;
};

function selfEntry(selfBaseUrl: string): PillarRegistryEntry {
  return {
    id: ORCHESTRATOR_PILLAR_ID,
    baseUrl: parseBareOrigin("orchestrator's selfBaseUrl", selfBaseUrl),
  };
}

/**
 * Env-seed projection (synchronous). The `POPS_PILLARS` fallback view used when
 * the registry is unreachable and nothing is cached. Drops a stale
 * `orchestrator` seed entry in favour of the live self entry.
 */
export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  const withoutSelf = seedEntries().filter((p) => p.id !== ORCHESTRATOR_PILLAR_ID);
  return [selfEntry(options.selfBaseUrl), ...withoutSelf];
}

/**
 * Registry-first pillar view (async). Live snapshot entries lead; `POPS_PILLARS`
 * seed entries backfill ids the snapshot has no entry for. Falls back to the
 * env-only {@link getPillarRegistry} when the registry is unreachable.
 */
export async function resolvePillarRegistry(
  options: PillarRegistryOptions,
  reader: RegistrySnapshotReader = defaultSnapshotReader
): Promise<readonly PillarRegistryEntry[]> {
  let live: readonly PillarSnapshot[];
  try {
    live = await reader();
  } catch (err) {
    // Registry unreachable with an empty cache: the seed is the only signal we
    // have, so degrade to the env-only view rather than serving nothing.
    if (err instanceof RegistryUnreachableError) return getPillarRegistry(options);
    throw err;
  }

  const liveById = new Map<string, PillarRegistryEntry>();
  for (const pillar of live) {
    if (pillar.pillarId === ORCHESTRATOR_PILLAR_ID) continue;
    liveById.set(pillar.pillarId, { id: pillar.pillarId, baseUrl: pillar.baseUrl });
  }

  // Registry-first ordering: live entries lead, seed-only ids follow. The seed
  // is the fallback, so it MUST NOT shadow a registered pillar.
  const merged: PillarRegistryEntry[] = [...liveById.values()];
  for (const seed of seedEntries()) {
    if (seed.id === ORCHESTRATOR_PILLAR_ID) continue;
    if (liveById.has(seed.id)) continue;
    merged.push(seed);
  }

  return [selfEntry(options.selfBaseUrl), ...merged];
}

/** Test-only: forget the cached `POPS_PILLARS` seed so a new value is re-read. */
export function __resetPillarRegistryCache(): void {
  cachedSeed = undefined;
}
