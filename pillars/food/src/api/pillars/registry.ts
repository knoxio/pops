/**
 * Pillar registry view served by food-api.
 *
 * Wraps `parsePillarsEnv` with a process-level cache. Adds the synthetic
 * `food` entry so the shell sees the host pillar in the `/pillars` listing
 * without having to special-case the call site.
 */
import { parseBareOrigin, parsePillarsEnv } from './env.js';

import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

export interface PillarRegistryOptions {
  /**
   * HTTP origin food-api is reachable at. Required — `server.ts`
   * derives it from `FOOD_SELF_BASE_URL` (or falls back to
   * `http://localhost:PORT`) before passing it in. The registry
   * returns this as the synthetic `food` entry's `baseUrl` after
   * normalising it through `parseBareOrigin` so callers can always
   * append `/uri/resolve` etc. without a double-slash or stale path
   * prefix.
   */
  readonly selfBaseUrl: string;
}

export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const normalisedSelf = parseBareOrigin("food's selfBaseUrl", options.selfBaseUrl);
  const withoutSelf = cached.filter((p) => p.id !== 'food');
  return [{ id: 'food', baseUrl: normalisedSelf }, ...withoutSelf];
}

/** Test-only: forget the cached registry so a new `POPS_PILLARS` is re-read. */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
