/**
 * Pillar registry view served by the orchestrator.
 *
 * Wraps the local copy of `parsePillarsEnv` with a process-level cache
 * (same pattern the pillars use). Adds the synthetic `orchestrator` entry
 * so a consumer sees the federating service alongside the pillars it
 * aggregates over without having to special-case the call site.
 */
import { parseBareOrigin, parsePillarsEnv } from './env.js';

import type { PillarRegistryEntry } from '@pops/types';

export const ORCHESTRATOR_PILLAR_ID = 'orchestrator' as const;

let cached: readonly PillarRegistryEntry[] | undefined;

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

export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const normalisedSelf = parseBareOrigin("orchestrator's selfBaseUrl", options.selfBaseUrl);
  const withoutSelf = cached.filter((p) => p.id !== ORCHESTRATOR_PILLAR_ID);
  return [{ id: ORCHESTRATOR_PILLAR_ID, baseUrl: normalisedSelf }, ...withoutSelf];
}

/** Test-only: forget the cached registry so a new `POPS_PILLARS` is re-read. */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
