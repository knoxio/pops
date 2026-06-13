/**
 * `buildToolList()` — the dynamic AI tool list (PRD-201).
 *
 * The AI orchestrator calls this once per request. It pulls the current
 * registry snapshot from the discovery cache (PRD-159), projects each
 * registered pillar's `ai.tools` manifest slot (PRD-200) into a flat
 * list, and filters out pillars that aren't currently healthy.
 *
 * Caching
 *   We additionally memoise the projected list keyed by the snapshot's
 *   `fetchedAt` timestamp, with a 30s wall-clock floor matching the
 *   discovery TTL. This keeps high-frequency AI request bursts from
 *   re-walking the manifests every time while still tracking the
 *   underlying discovery TTL — if discovery serves a fresh snapshot, the
 *   memoised entry is invalidated automatically.
 *
 * Known limitation
 *   Pillars in the wild only populate `manifest.ai.tools` once they ship
 *   PRD-200-compliant tool descriptors. Until then the function returns
 *   an empty list — which is the correct degraded behaviour (the AI runs
 *   with whatever in-process tools the orchestrator carries).
 */
import { pillarRegistry } from '../discovery/index.js';

import type { PillarSnapshot, PillarStatus, RegistrySnapshot } from '../discovery/index.js';
import type { BuildToolListOptions, Tool } from './types.js';

export const TOOL_LIST_CACHE_TTL_MS = 30_000;

type CacheKey = string;

type CacheEntry = {
  tools: readonly Tool[];
  expiresAt: number;
};

type Clock = () => number;

type FetchSnapshot = () => Promise<RegistrySnapshot>;

type Internals = {
  cache: Map<CacheKey, CacheEntry>;
  now: Clock;
  fetchSnapshot: FetchSnapshot;
};

const internals: Internals = {
  cache: new Map(),
  now: () => Date.now(),
  fetchSnapshot: pillarRegistry,
};

export async function buildToolList(opts: BuildToolListOptions = {}): Promise<readonly Tool[]> {
  const snapshot = await internals.fetchSnapshot();
  const key = makeCacheKey(snapshot.fetchedAt, opts);
  const now = internals.now();

  const cached = internals.cache.get(key);
  if (cached !== undefined && cached.expiresAt > now) return cached.tools;

  const tools = projectTools(snapshot.pillars, opts);
  internals.cache.set(key, { tools, expiresAt: now + TOOL_LIST_CACHE_TTL_MS });
  pruneExpired(now);
  return tools;
}

/**
 * Drop every memoised tool list. Tests and the discovery-invalidation
 * hook (PRD-159) call this to force a rebuild on next request.
 */
export function invalidateToolListCache(): void {
  internals.cache.clear();
}

/**
 * Test hook — swap the snapshot source and clock. The public surface
 * sticks to `buildToolList`; this is intentionally not re-exported from
 * the package root.
 */
export function __setBuildToolListInternals(overrides: Partial<Internals>): void {
  if (overrides.now !== undefined) internals.now = overrides.now;
  if (overrides.fetchSnapshot !== undefined) internals.fetchSnapshot = overrides.fetchSnapshot;
  internals.cache.clear();
}

export function __resetBuildToolListInternals(): void {
  internals.cache.clear();
  internals.now = () => Date.now();
  internals.fetchSnapshot = pillarRegistry;
}

function projectTools(
  pillars: readonly PillarSnapshot[],
  opts: BuildToolListOptions
): readonly Tool[] {
  const allowList = opts.pillars !== undefined ? new Set(opts.pillars) : null;
  const includeUnavailable = opts.includeUnavailable === true;
  const out: Tool[] = [];

  for (const pillar of pillars) {
    if (allowList !== null && !allowList.has(pillar.pillarId)) continue;
    const status = resolveStatus(pillar);
    if (!includeUnavailable && status !== 'healthy') continue;

    for (const tool of pillar.manifest.ai.tools) {
      out.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        pillar: pillar.pillarId,
        pillarStatus: status,
      });
    }
  }
  return out;
}

/**
 * Resolve the effective availability of a pillar for tool-list
 * purposes.
 *
 * `registered=false` is authoritative — call-time `guardAvailability`
 * in the client factory treats an unregistered pillar as unavailable
 * regardless of `status`, so the tool list must not advertise tools
 * the orchestrator will then refuse to route. This matters during
 * PRD-162 reconciliation windows where a snapshot can carry
 * `status: 'healthy'` from the last heartbeat while the registry has
 * already flipped `registered` to false.
 *
 * Snapshots from PRD-161 carry an explicit `status`; older ones don't.
 * When `status` is missing we fall back to the same `registered`
 * signal.
 */
function resolveStatus(pillar: PillarSnapshot): PillarStatus {
  if (!pillar.registered) return 'unavailable';
  if (pillar.status !== undefined) return pillar.status;
  return 'healthy';
}

function makeCacheKey(fetchedAt: Date, opts: BuildToolListOptions): CacheKey {
  const pillars = opts.pillars !== undefined ? [...opts.pillars].toSorted().join(',') : '*';
  const include = opts.includeUnavailable === true ? '1' : '0';
  return `${fetchedAt.getTime()}|${pillars}|${include}`;
}

function pruneExpired(now: number): void {
  for (const [key, entry] of internals.cache) {
    if (entry.expiresAt <= now) internals.cache.delete(key);
  }
}
