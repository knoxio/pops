/**
 * POPS_APPS / POPS_OVERLAYS env contract (PRD-100, Tier 1 module runtime).
 *
 * Operators choose which optional modules are installed via comma-separated
 * env vars. `core` is always installed (it's the platform shell, not a
 * domain module). When unset (or empty), every module is installed —
 * preserves backwards compatibility with pre-PRD-100 deployments.
 *
 * Validation is strict: invalid module ids and operator footguns (e.g. only
 * commas/whitespace, which would parse to an empty installed set instead of
 * "install all") are errors at startup, not silent defaults. Operators get a
 * clear message naming the bad value and the valid set.
 */
import { getEnv } from '../env.js';

/** Apps that may be listed in `POPS_APPS`. */
export const KNOWN_APPS = ['finance', 'media', 'inventory', 'cerebrum'] as const;
/** Overlays that may be listed in `POPS_OVERLAYS`. */
export const KNOWN_OVERLAYS = ['ego'] as const;

export type AppId = (typeof KNOWN_APPS)[number];
export type OverlayId = (typeof KNOWN_OVERLAYS)[number];

export interface InstalledModules {
  /** Apps mounted into the tRPC root + frontend router. */
  apps: ReadonlyArray<AppId>;
  /** Overlays the shell mounts into chrome slots. */
  overlays: ReadonlyArray<OverlayId>;
}

function parseList<TKnown extends string>(
  raw: string | undefined,
  known: ReadonlyArray<TKnown>,
  varName: string
): ReadonlyArray<TKnown> {
  if (raw === undefined || raw.trim() === '') {
    return known;
  }
  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (requested.length === 0) {
    throw new Error(
      `${varName} parsed to an empty list (only whitespace/commas). ` +
        `Leave the variable unset/empty to install all, or provide at least one of: ${known.join(', ')}.`
    );
  }

  const validSet = new Set<string>(known);
  const invalid = requested.filter((id) => !validSet.has(id));
  if (invalid.length > 0) {
    throw new Error(
      `${varName} contains unknown module id(s): ${invalid.join(', ')}. ` +
        `Valid values: ${known.join(', ')}. Leave empty to install all.`
    );
  }

  // Deduplicate while preserving operator-specified order
  const seen = new Set<TKnown>();
  const result: TKnown[] = [];
  for (const id of requested as TKnown[]) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

let cached: InstalledModules | null = null;

/**
 * Read `POPS_APPS` and `POPS_OVERLAYS` from the environment and return the
 * installed module set. Throws if either var contains an unknown id or
 * parses to an empty list.
 *
 * Result is cached on first read so the env is parsed once per process.
 * Tests can call `__resetInstalledModulesCache()` between cases.
 *
 * Empty / unset == "all known modules".
 */
export function readInstalledModules(): InstalledModules {
  if (cached) return cached;
  cached = {
    apps: parseList(getEnv('POPS_APPS'), KNOWN_APPS, 'POPS_APPS'),
    overlays: parseList(getEnv('POPS_OVERLAYS'), KNOWN_OVERLAYS, 'POPS_OVERLAYS'),
  };
  return cached;
}

/** Test-only: clear the cache so the next call re-reads `process.env`. */
export function __resetInstalledModulesCache(): void {
  cached = null;
}
