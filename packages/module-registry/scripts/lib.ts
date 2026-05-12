/**
 * Pure helpers powering the registry build. Split out of `build.ts` so the
 * test file can call them without invoking `main()` (which writes to disk
 * and exits the process).
 */
import { assertModuleManifest, type ModuleManifest, type SettingsManifest } from '@pops/types';

import { warnUnknownChromeSlots } from './chrome-slots.js';

/**
 * Project the serialisable subset of a `ModuleManifest` — id, name,
 * version, surfaces, description, dependsOn, capabilities, plus the live
 * `settings` slot (pure data, PRD-101 US-04 follow-up) — and structural
 * flags consumers can read without importing the live manifest. Code-bearing
 * slots (`backend.router`, `frontend.routes`, handler functions) are
 * intentionally elided; consumer wiring re-attaches them at the call site.
 */
export interface SerialisableModule {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly surfaces: readonly ('app' | 'overlay')[];
  readonly description?: string;
  readonly dependsOn?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly hasBackend: boolean;
  readonly hasFrontend: boolean;
  readonly overlay?: { readonly chromeSlot: string; readonly shortcut?: string };
  readonly settings?: readonly SettingsManifest[];
}

function assertEachManifest(manifests: readonly ModuleManifest[]): void {
  for (const m of manifests) {
    assertModuleManifest(m, `module '${m.id}'`);
  }
}

function assertUniqueIds(manifests: readonly ModuleManifest[]): void {
  const seen = new Set<string>();
  for (const m of manifests) {
    if (seen.has(m.id)) {
      throw new Error(`duplicate module id '${m.id}'`);
    }
    seen.add(m.id);
  }
}

function assertDependenciesResolvable(manifests: readonly ModuleManifest[]): void {
  const known = new Set(manifests.map((m) => m.id));
  for (const m of manifests) {
    for (const dep of m.dependsOn ?? []) {
      if (!known.has(dep)) {
        throw new Error(`module '${m.id}' dependsOn '${dep}' which is not in the install set`);
      }
    }
  }
}

/**
 * URI handler types must not collide across modules. The owning module's
 * own `(id, type)` pair is allowed (idempotent re-declaration) but two
 * different modules claiming the same logical type is a contract
 * violation that callers can't disambiguate.
 */
function assertUriHandlersDisjoint(manifests: readonly ModuleManifest[]): void {
  const owner = new Map<string, string>();
  for (const m of manifests) {
    for (const t of m.uriHandler?.types ?? []) {
      const previous = owner.get(t);
      if (previous !== undefined && previous !== m.id) {
        throw new Error(`URI handler type '${t}' is claimed by both '${previous}' and '${m.id}'`);
      }
      owner.set(t, m.id);
    }
  }
}

function assertAiToolNamesUnique(manifests: readonly ModuleManifest[]): void {
  const owner = new Map<string, string>();
  for (const m of manifests) {
    for (const tool of m.backend?.aiTools ?? []) {
      const previous = owner.get(tool.name);
      if (previous !== undefined) {
        throw new Error(
          `AI tool name '${tool.name}' is declared by both '${previous}' and '${m.id}'`
        );
      }
      owner.set(tool.name, m.id);
    }
  }
}

/**
 * Per-manifest plus cross-manifest contract assertions. Throws `Error`
 * with a message naming the offending module on the first violation.
 *
 * Layered on top of `assertModuleManifest()` (which catches per-manifest
 * shape errors): this helper additionally enforces duplicate ids, unknown
 * `dependsOn` targets, URI handler type collisions, and global AI tool
 * name collisions.
 *
 * Unknown `frontend.overlay.chromeSlot` values are reported via the
 * optional `warn` callback (defaults to `process.stderr`) — slot names are
 * conventional, not enumerable from the type system, so this is a warning
 * not a hard error (PRD-101 US-07 acceptance criterion).
 */
export function validateManifests(
  manifests: readonly ModuleManifest[],
  warn: (message: string) => void = (msg) => process.stderr.write(`warning: ${msg}\n`)
): void {
  assertEachManifest(manifests);
  assertUniqueIds(manifests);
  assertDependenciesResolvable(manifests);
  assertUriHandlersDisjoint(manifests);
  assertAiToolNamesUnique(manifests);
  warnUnknownChromeSlots(manifests, warn);
}

export function project(m: ModuleManifest): SerialisableModule {
  const overlay = m.frontend?.overlay;
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    surfaces: [...m.surfaces],
    description: m.description,
    dependsOn: m.dependsOn !== undefined ? [...m.dependsOn] : undefined,
    capabilities: m.capabilities !== undefined ? [...m.capabilities] : undefined,
    hasBackend: m.backend !== undefined,
    hasFrontend: m.frontend !== undefined,
    overlay:
      overlay !== undefined
        ? { chromeSlot: overlay.chromeSlot, shortcut: overlay.shortcut }
        : undefined,
    settings: m.settings !== undefined ? [...m.settings] : undefined,
  };
}

/**
 * Resolve which modules are "installed" for this build. Mirrors PRD-100
 * `POPS_APPS` / `POPS_OVERLAYS` semantics: unset / empty = install all
 * known modules; comma-separated list = install only those (intersected
 * with `KNOWN_MODULES`).
 *
 * `alwaysInstalled` ids stay in the result regardless of env restrictions —
 * `core` is the always-mounted platform shell (PRD-100), so excluding it
 * from `MODULES` via `POPS_APPS=finance` would amount to "no core" which is
 * never the intent.
 *
 * Unknown ids in the env vars are silently dropped at this layer because
 * `apps/pops-api/src/modules/env-modules.ts` is the canonical strict
 * validator at boot. The registry build only needs to know the resulting
 * id set.
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

export { renderFile } from './render.js';
import { renderFile } from './render.js';

export interface BuildRegistryOptions {
  /** Captures chrome-slot warnings during validation; falls back to stderr. */
  warn?: (message: string) => void;
  /**
   * Module ids that stay in `MODULES` even when `POPS_APPS` / `POPS_OVERLAYS`
   * would otherwise restrict the install set. `core` is the canonical example.
   */
  alwaysInstalled?: readonly string[];
}

/**
 * Compose the full build pipeline as a pure function over an explicit
 * `(manifests, env)` input. Returns the rendered TypeScript source plus
 * the count of selected modules.
 */
export function buildRegistrySource(
  manifests: readonly ModuleManifest[],
  knownIds: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  options: BuildRegistryOptions = {}
): { source: string; count: number } {
  const { warn, alwaysInstalled = [] } = options;
  if (warn !== undefined) {
    validateManifests(manifests, warn);
  } else {
    validateManifests(manifests);
  }
  const installed = new Set(resolveInstalledIds(knownIds, env, alwaysInstalled));
  const selected = manifests.filter((m) => installed.has(m.id));
  const sorted = selected.toSorted((a, b) => a.id.localeCompare(b.id, 'en'));
  const projected = sorted.map(project);
  return { source: renderFile(projected), count: projected.length };
}
