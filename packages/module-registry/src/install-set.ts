/**
 * Install-set resolver shared by the build script (`scripts/build.ts`) and
 * the runtime `INSTALLED_MODULES` export (PRD-218 US-01).
 *
 * Mirrors the PRD-100 `POPS_APPS` / `POPS_OVERLAYS` env contract:
 *
 *   - Both env vars unset  → install every known id.
 *   - At least one set     → install only the union of their CSV entries,
 *                            intersected with the known id list.
 *   - `alwaysInstalled` ids stay in the result regardless. `core` is the
 *     canonical example — it is the platform shell and must never be gated.
 *
 * Unknown ids in the env vars are silently dropped here because
 * `apps/pops-api/src/modules/env-modules.ts` is the canonical strict
 * validator at boot. This resolver only needs to know the resulting id set.
 */
export function resolveInstalledIds(
  knownIds: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  alwaysInstalled: readonly string[] = []
): readonly string[] {
  const fromEnv = (raw: string | undefined): readonly string[] => {
    if (raw === undefined || raw.trim() === '') return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const appsRaw = env.POPS_APPS;
  const overlaysRaw = env.POPS_OVERLAYS;

  if (appsRaw === undefined && overlaysRaw === undefined) {
    return knownIds;
  }

  const envSet = new Set<string>([
    ...fromEnv(appsRaw),
    ...fromEnv(overlaysRaw),
    ...alwaysInstalled,
  ]);
  const known = new Set(knownIds);
  return knownIds.filter((id) => envSet.has(id) && known.has(id));
}
