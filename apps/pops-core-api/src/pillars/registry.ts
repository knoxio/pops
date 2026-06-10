/**
 * Pillar registry view served by core-api.
 *
 * Wraps the local copy of `parsePillarsEnv` with a process-level cache
 * (same pattern pops-api uses). Adds the synthetic `core` entry so the
 * shell sees the host pillar in the `/pillars` listing without having
 * to special-case the call site.
 */
import { parseBareOrigin, parsePillarsEnv } from './env.js';

import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

export interface PillarRegistryOptions {
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
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const normalisedSelf = parseBareOrigin("core's selfBaseUrl", options.selfBaseUrl);
  const withoutSelf = cached.filter((p) => p.id !== 'core');
  return [{ id: 'core', baseUrl: normalisedSelf }, ...withoutSelf];
}

/** Test-only: forget the cached registry so a new `POPS_PILLARS` is re-read. */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
