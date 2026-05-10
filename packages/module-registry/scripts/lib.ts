/**
 * Pure helpers powering the registry build. Split out of `build.ts` so the
 * test file can call them without invoking `main()` (which writes to disk
 * and exits the process).
 */
import { assertModuleManifest, type ModuleManifest } from '@pops/types';

/**
 * Project the serialisable subset of a `ModuleManifest` — id, name,
 * version, surfaces, description, dependsOn, capabilities — plus structural
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
 */
export function validateManifests(manifests: readonly ModuleManifest[]): void {
  assertEachManifest(manifests);
  assertUniqueIds(manifests);
  assertDependenciesResolvable(manifests);
  assertUriHandlersDisjoint(manifests);
  assertAiToolNamesUnique(manifests);
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
  };
}

/**
 * Resolve which modules are "installed" for this build. Mirrors PRD-100
 * `POPS_APPS` / `POPS_OVERLAYS` semantics: unset / empty = install all
 * known modules; comma-separated list = install only those (intersected
 * with `KNOWN_MODULES`).
 *
 * Unknown ids in the env vars are silently dropped at this layer because
 * `apps/pops-api/src/modules/env-modules.ts` is the canonical strict
 * validator at boot. The registry build only needs to know the resulting
 * id set.
 */
export function resolveInstalledIds(
  knownIds: readonly string[],
  env: Readonly<Record<string, string | undefined>>
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

  const envSet = new Set<string>([...fromEnv(appsRaw), ...fromEnv(overlaysRaw)]);
  const known = new Set(knownIds);
  return knownIds.filter((id) => envSet.has(id) && known.has(id));
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function renderModule(m: SerialisableModule): string {
  const lines: string[] = ['  {'];
  lines.push(`    id: ${quote(m.id)},`);
  lines.push(`    name: ${quote(m.name)},`);
  if (m.version !== undefined) lines.push(`    version: ${quote(m.version)},`);
  lines.push(`    surfaces: [${m.surfaces.map(quote).join(', ')}] as const,`);
  if (m.description !== undefined) lines.push(`    description: ${quote(m.description)},`);
  if (m.dependsOn !== undefined) {
    lines.push(`    dependsOn: [${m.dependsOn.map(quote).join(', ')}] as const,`);
  }
  if (m.capabilities !== undefined) {
    lines.push(`    capabilities: [${m.capabilities.map(quote).join(', ')}] as const,`);
  }
  lines.push(`    hasBackend: ${m.hasBackend},`);
  lines.push(`    hasFrontend: ${m.hasFrontend},`);
  if (m.overlay !== undefined) {
    const inner = [`chromeSlot: ${quote(m.overlay.chromeSlot)}`];
    if (m.overlay.shortcut !== undefined) {
      inner.push(`shortcut: ${quote(m.overlay.shortcut)}`);
    }
    lines.push(`    overlay: { ${inner.join(', ')} },`);
  }
  lines.push('  }');
  return lines.join('\n');
}

/**
 * Render the generated TypeScript source for a sorted list of modules.
 * Single-quoted strings and explicit `as const` tuples are emitted so the
 * output matches the project's oxfmt style and so consumers get exact
 * literal narrowing on `id` and `surfaces`.
 */
export function renderFile(modules: readonly SerialisableModule[]): string {
  const header = [
    '/**',
    ' * GENERATED FILE — do not edit by hand.',
    ' *',
    ' * Built from `packages/module-registry/scripts/known-modules.ts` by',
    ' * `pnpm registry:build`. CI verifies this file is up to date; commit',
    ' * regenerated output alongside any change to the source manifest list.',
    ' *',
    ' * See `docs/themes/01-foundation/prds/101-plugin-contract/us-02-build-time-registry.md`.',
    ' */',
  ].join('\n');

  const idLiteralUnion = modules.map((m) => quote(m.id)).join(' | ');

  const knownModulesLine =
    modules.length === 0
      ? 'export const KNOWN_MODULES: readonly string[] = [] as const;'
      : `export const KNOWN_MODULES = [${modules.map((m) => quote(m.id)).join(', ')}] as const;`;

  const modulesBody = modules.length === 0 ? '' : `\n${modules.map(renderModule).join(',\n')},\n`;

  const idTypeLine =
    modules.length === 0
      ? 'export type GeneratedModuleId = never;'
      : `export type GeneratedModuleId = ${idLiteralUnion};`;

  return [
    header,
    '',
    knownModulesLine,
    '',
    `export const MODULES = [${modulesBody}] as const;`,
    '',
    idTypeLine,
    '',
  ].join('\n');
}

/**
 * Compose the full build pipeline as a pure function over an explicit
 * `(manifests, env)` input. Returns the rendered TypeScript source plus
 * the count of selected modules.
 */
export function buildRegistrySource(
  manifests: readonly ModuleManifest[],
  knownIds: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): { source: string; count: number } {
  validateManifests(manifests);
  const installed = new Set(resolveInstalledIds(knownIds, env));
  const selected = manifests.filter((m) => installed.has(m.id));
  const sorted = selected.toSorted((a, b) => a.id.localeCompare(b.id, 'en'));
  const projected = sorted.map(project);
  return { source: renderFile(projected), count: projected.length };
}
