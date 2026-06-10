import { parsePillarsEnv } from './env.js';

/**
 * Pillar registry view served by core-api.
 *
 * Wraps the local copy of `parsePillarsEnv` with a process-level cache
 * (same pattern pops-api uses). Adds the synthetic `core` entry so the
 * shell sees the host pillar in the `/pillars` listing without having
 * to special-case the call site.
 */
import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

export interface PillarRegistryOptions {
  /**
   * The HTTP origin core-api is reachable at. Surfaced as the synthetic
   * `core` entry's `baseUrl`. Defaults to `http://localhost:${port}` for
   * tests; production callers should pass the same URL the deployer
   * gave the shell + sibling pillars (via the `POPS_PILLARS` `core:`
   * entry).
   */
  readonly selfBaseUrl: string;
}

export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const withoutSelf = cached.filter((p) => p.id !== 'core');
  return [{ id: 'core', baseUrl: options.selfBaseUrl }, ...withoutSelf];
}

/** Test-only: forget the cached registry so a new `POPS_PILLARS` is re-read. */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
