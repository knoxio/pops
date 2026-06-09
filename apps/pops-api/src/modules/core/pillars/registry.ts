/**
 * Pillar registry loader (ADR-026 pre-flight P2).
 *
 * Wraps `parsePillarsEnv` with a cached snapshot of the current `POPS_PILLARS`
 * value. Most callers (`/uri/resolve` dispatcher, `/pillars` listing) want a
 * stable view across the lifetime of an HTTP request without re-reading the
 * env var; a small reset hook exists for tests that mutate `process.env`.
 *
 * The registry is intentionally process-local — there is no service-discovery
 * round trip. ADR-026's model is "deployer sets `POPS_PILLARS`, every pillar
 * reads the same string". If the env changes the process must restart.
 */

import { getEnv } from '../../../env.js';
import { parsePillarsEnv, type ParsePillarsEnvOptions } from './env.js';

import type { PillarRegistryEntry } from '@pops/types';

let cached: readonly PillarRegistryEntry[] | undefined;

/**
 * Returns the parsed pillar registry, memoised after the first call.
 *
 * The default `allowEmpty: true` matches the deployment story today: most
 * environments don't yet split into pillars, so an unset `POPS_PILLARS`
 * legitimately means "no remote pillars; resolve everything in-process".
 */
export function getPillarRegistry(
  options?: ParsePillarsEnvOptions
): readonly PillarRegistryEntry[] {
  cached ??= parsePillarsEnv(getEnv('POPS_PILLARS'), options);
  return cached;
}

/** Look up a pillar by id, or `undefined` if it is not in the registry. */
export function getPillarEntry(id: string): PillarRegistryEntry | undefined {
  return getPillarRegistry().find((p) => p.id === id);
}

/**
 * Test-only: clear the memoised registry so the next `getPillarRegistry()`
 * call re-reads `process.env.POPS_PILLARS`. Mirrors the
 * `__resetInstalledModulesCache` pattern used by `env-modules.ts`.
 */
export function __resetPillarRegistryCache(): void {
  cached = undefined;
}
