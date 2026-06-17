/**
 * Pillar registry view served by media-api.
 *
 * Wraps the local copy of `parsePillarsEnv` with a process-level cache
 * (same pattern pops-api uses). Adds the synthetic `media` entry so the
 * shell sees the host pillar in the `/pillars` listing without having to
 * special-case the call site.
 */
import { parseBareOrigin, parsePillarsEnv } from './env.js';

import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

export interface PillarRegistryOptions {
  /**
   * HTTP origin media-api is reachable at. Required — `server.ts` derives
   * it from `MEDIA_SELF_BASE_URL` (or falls back to `http://localhost:PORT`)
   * before passing it in. The registry returns this as the synthetic
   * `media` entry's `baseUrl` after normalising it through
   * `parseBareOrigin`.
   */
  readonly selfBaseUrl: string;
}

export function getPillarRegistry(options: PillarRegistryOptions): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(process.env['POPS_PILLARS']);
  const normalisedSelf = parseBareOrigin("media's selfBaseUrl", options.selfBaseUrl);
  const withoutSelf = cached.filter((p) => p.id !== 'media');
  return [{ id: 'media', baseUrl: normalisedSelf }, ...withoutSelf];
}

/** Test-only: forget the cached registry so a new `POPS_PILLARS` is re-read. */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
