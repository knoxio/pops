/**
 * Pillar registry view served by finance-api.
 *
 * Wraps the local copy of `parsePillarsEnv` with a process-level cache
 * (same pattern pops-api uses). Adds the synthetic `finance` entry so the
 * shell sees the host pillar in the `/pillars` listing without having to
 * special-case the call site.
 */
import { parseBareOrigin, parsePillarsEnv } from './env.js';

import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

export interface PillarRegistryOptions {
  /**
   * HTTP origin finance-api is reachable at. Required — `server.ts`
   * derives it from `FINANCE_SELF_BASE_URL` (or falls back to
   * `http://localhost:PORT`) before passing it in. The registry returns
   * this as the synthetic `finance` entry's `baseUrl` after normalising
   * it through `parseBareOrigin`.
   */
  readonly selfBaseUrl: string;
}

export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const normalisedSelf = parseBareOrigin("finance's selfBaseUrl", options.selfBaseUrl);
  const withoutSelf = cached.filter((p) => p.id !== 'finance');
  return [{ id: 'finance', baseUrl: normalisedSelf }, ...withoutSelf];
}

/** Test-only: forget the cached registry so a new `POPS_PILLARS` is re-read. */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
