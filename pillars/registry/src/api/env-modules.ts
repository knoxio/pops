/**
 * POPS_APPS / POPS_OVERLAYS env contract.
 *
 * The pillar reads `process.env` directly (matching `core-sqlite-path.ts`):
 * the container ships its module set through plain env vars, so no
 * secret-file lookup is needed.
 *
 * Operators choose which optional modules are installed via comma-separated
 * env vars. The platform pillar is always installed (it's the shell, not a
 * domain module). When unset (or empty), every module is installed.
 *
 * Validation is strict: invalid module ids and operator footguns (e.g. only
 * commas/whitespace, which would parse to an empty installed set instead of
 * "install all") are errors, not silent defaults.
 */

/** Apps that may be listed in `POPS_APPS`. */
export const KNOWN_APPS = ['finance', 'media', 'inventory', 'cerebrum'] as const;
/** Overlays that may be listed in `POPS_OVERLAYS`. */
export const KNOWN_OVERLAYS = ['ego'] as const;

export type AppId = (typeof KNOWN_APPS)[number];
export type OverlayId = (typeof KNOWN_OVERLAYS)[number];

export interface InstalledModules {
  /** Installed app modules. */
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
 * parses to an empty list. Result is cached on first read.
 *
 * Empty / unset == "all known modules".
 */
export function readInstalledModules(): InstalledModules {
  if (cached) return cached;
  cached = {
    apps: parseList(process.env['POPS_APPS'], KNOWN_APPS, 'POPS_APPS'),
    overlays: parseList(process.env['POPS_OVERLAYS'], KNOWN_OVERLAYS, 'POPS_OVERLAYS'),
  };
  return cached;
}

/** Test-only: clear the cache so the next call re-reads `process.env`. */
export function __resetInstalledModulesCache(): void {
  cached = null;
}
