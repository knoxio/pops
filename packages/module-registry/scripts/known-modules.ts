/**
 * Workspace-discovered manifest sources for the registry build (PRD-241 US-02).
 *
 * Discovery contract:
 *
 *   - Enumerate workspace packages matching `@pops/*-contract`
 *     (`packages/*-contract/package.json`).
 *   - For each contract package that declares a `./manifest` subpath in its
 *     `exports`, dynamically import `@pops/<x>-contract/manifest` and collect
 *     every exported value that satisfies `ModuleManifest` (a contract
 *     package may export more than one — `@pops/core-contract/manifest`
 *     carries both `coreManifest` and `aiManifest`; `@pops/cerebrum-contract`
 *     carries `cerebrumManifest` and `egoManifest`).
 *   - Packages without a `./manifest` subpath (e.g. the legacy
 *     `@pops/food-contracts` plural variant, or contracts for surfaces not
 *     yet promoted to pillar) are skipped with a build-log info line.
 *
 * No file in `@pops/module-registry` names a pillar id. Adding a new in-repo
 * pillar = adding a contract package with a `./manifest` export and pinning
 * it in `module-registry/package.json` devDependencies. See PRD-241 README.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertModuleManifest, type ModuleManifest } from '@pops/types';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(here, '..');
const PACKAGES_ROOT = join(PACKAGE_ROOT, '..');
const REPO_ROOT = join(PACKAGES_ROOT, '..');
const PILLARS_ROOT = join(REPO_ROOT, 'pillars');

const CONTRACT_SUFFIX = '-contract';
const MANIFEST_SUBPATH = './manifest';

interface ContractPackage {
  readonly name: string;
  readonly dir: string;
  readonly manifestEntry: string | undefined;
}

interface ManifestExportsEntry {
  readonly default?: string;
}

type ExportsField = Record<string, string | ManifestExportsEntry | undefined>;

interface ContractPackageJson {
  readonly name?: string;
  readonly exports?: ExportsField;
}

function isContractPackageJson(value: unknown): value is ContractPackageJson {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { name?: unknown; exports?: unknown };
  if (candidate.name !== undefined && typeof candidate.name !== 'string') return false;
  if (
    candidate.exports !== undefined &&
    (candidate.exports === null || typeof candidate.exports !== 'object')
  ) {
    return false;
  }
  return true;
}

function pickManifestEntry(exportsField: ExportsField | undefined): string | undefined {
  const entry = exportsField?.[MANIFEST_SUBPATH];
  if (entry === undefined) return undefined;
  if (typeof entry === 'string') return entry;
  return entry.default;
}

async function readContractPackage(
  pkgDir: string,
  expectedSuffix: string
): Promise<ContractPackage | null> {
  const pkgPath = join(pkgDir, 'package.json');
  let raw: string;
  try {
    raw = await readFile(pkgPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isContractPackageJson(parsed)) {
    throw new Error(`malformed package.json at ${pkgPath}`);
  }
  const name = parsed.name;
  if (name === undefined || !name.startsWith('@pops/') || !name.endsWith(expectedSuffix)) {
    return null;
  }
  return {
    name,
    dir: pkgDir,
    manifestEntry: pickManifestEntry(parsed.exports),
  };
}

async function listContractPackages(packagesRoot: string): Promise<ContractPackage[]> {
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await readdir(packagesRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(CONTRACT_SUFFIX))
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b, 'en'));

  const out: ContractPackage[] = [];
  for (const dirName of candidates) {
    const pkg = await readContractPackage(join(packagesRoot, dirName), CONTRACT_SUFFIX);
    if (pkg !== null) out.push(pkg);
  }
  return out;
}

/**
 * Walk `pillars/<id>/contract/` directories (PRD-253 colocated layout)
 * and return contract package records the same shape `listContractPackages`
 * produces. Returns `[]` if `pillars/` is absent (pre-colocation repos).
 */
async function listColocatedContractPackages(pillarsRoot: string): Promise<ContractPackage[]> {
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await readdir(pillarsRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b, 'en'));

  const out: ContractPackage[] = [];
  for (const dirName of candidates) {
    const pkg = await readContractPackage(join(pillarsRoot, dirName, 'contract'), CONTRACT_SUFFIX);
    if (pkg !== null) out.push(pkg);
  }
  return out;
}

function looksLikeModuleManifest(value: unknown): value is ModuleManifest {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { id?: unknown; name?: unknown; surfaces?: unknown };
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.surfaces)
  );
}

function collectModuleManifests(mod: Record<string, unknown>, pkgName: string): ModuleManifest[] {
  const collected: ModuleManifest[] = [];
  for (const [exportName, value] of Object.entries(mod)) {
    if (!looksLikeModuleManifest(value)) continue;
    assertModuleManifest(value, `${pkgName}/manifest export '${exportName}'`);
    collected.push(value);
  }
  return collected;
}

export interface DiscoverOptions {
  /** Override the packages directory; defaults to the monorepo `packages/`. */
  readonly packagesRoot?: string;
  /**
   * Override the pillars directory (PRD-253 colocated layout); defaults to
   * the monorepo `pillars/` when `packagesRoot` is at its default. When
   * `packagesRoot` is overridden (test fixtures), `pillarsRoot` falls back
   * to `undefined` (no scan) unless the caller sets it explicitly.
   */
  readonly pillarsRoot?: string;
  /**
   * Resolve `@pops/<id>-contract/manifest` to a module spec. Defaults to the
   * file-URL of the package's `exports['./manifest']` entry — works under
   * `tsx`, vitest, and compiled Node identically. Overridden by tests that
   * want to inject fixtures without touching disk.
   */
  readonly importManifest?: (pkg: ContractPackage) => Promise<Record<string, unknown>>;
  /** Build-log sink for the "skipped — no ./manifest" info lines. */
  readonly log?: (message: string) => void;
}

async function defaultImportManifest(pkg: ContractPackage): Promise<Record<string, unknown>> {
  if (pkg.manifestEntry === undefined) {
    throw new Error(`contract package '${pkg.name}' has no './manifest' export`);
  }
  const url = pathToFileURL(join(pkg.dir, pkg.manifestEntry)).href;
  const mod: unknown = await import(url);
  if (mod === null || typeof mod !== 'object') {
    throw new Error(`'${pkg.name}/manifest' did not resolve to a module`);
  }
  return mod as Record<string, unknown>;
}

/**
 * Walk `packages/*-contract` AND `pillars/<id>/contract` (PRD-253 colocated
 * layout) and return every `ModuleManifest` exported by a contract package's
 * `./manifest` subpath. Results are sorted by manifest id so the downstream
 * sort is stable regardless of filesystem iteration order.
 *
 * When the caller overrides `packagesRoot` without setting `pillarsRoot`,
 * the pillars scan is skipped so test fixtures isolate cleanly.
 */
export async function discoverManifestSources(
  options: DiscoverOptions = {}
): Promise<readonly ModuleManifest[]> {
  const {
    packagesRoot = PACKAGES_ROOT,
    importManifest = defaultImportManifest,
    log = (message) => process.stdout.write(`${message}\n`),
  } = options;
  const pillarsRoot =
    options.pillarsRoot ?? (packagesRoot === PACKAGES_ROOT ? PILLARS_ROOT : undefined);

  const contracts = [
    ...(await listContractPackages(packagesRoot)),
    ...(pillarsRoot === undefined ? [] : await listColocatedContractPackages(pillarsRoot)),
  ].toSorted((a, b) => a.name.localeCompare(b.name, 'en'));
  const manifests: ModuleManifest[] = [];

  for (const pkg of contracts) {
    if (pkg.manifestEntry === undefined) {
      log(`[known-modules] skipping ${pkg.name}: no './manifest' export`);
      continue;
    }
    const mod = await importManifest(pkg);
    const fromPkg = collectModuleManifests(mod, pkg.name);
    if (fromPkg.length === 0) {
      log(`[known-modules] skipping ${pkg.name}: './manifest' exports no ModuleManifest values`);
      continue;
    }
    manifests.push(...fromPkg);
  }

  return manifests.toSorted((a, b) => a.id.localeCompare(b.id, 'en'));
}

/**
 * Module ids that are always present in `MODULES` regardless of `POPS_APPS` /
 * `POPS_OVERLAYS`. `core` is the always-mounted platform shell — env vars
 * gate *optional* modules only (PRD-100).
 */
export const ALWAYS_INSTALLED_IDS: readonly string[] = ['core'];
