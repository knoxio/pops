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

async function listContractPackages(packagesRoot: string): Promise<ContractPackage[]> {
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(CONTRACT_SUFFIX))
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b, 'en'));

  const out: ContractPackage[] = [];
  for (const dirName of candidates) {
    const pkgPath = join(packagesRoot, dirName, 'package.json');
    const raw = await readFile(pkgPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isContractPackageJson(parsed)) {
      throw new Error(`malformed package.json at ${pkgPath}`);
    }
    const name = parsed.name;
    if (name === undefined || !name.startsWith('@pops/') || !name.endsWith(CONTRACT_SUFFIX)) {
      continue;
    }
    out.push({
      name,
      dir: join(packagesRoot, dirName),
      manifestEntry: pickManifestEntry(parsed.exports),
    });
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
 * Walk `packages/*-contract` and return every `ModuleManifest` exported by a
 * contract package's `./manifest` subpath. Results are sorted by manifest id
 * so the downstream sort is stable regardless of filesystem iteration order.
 */
export async function discoverManifestSources(
  options: DiscoverOptions = {}
): Promise<readonly ModuleManifest[]> {
  const {
    packagesRoot = PACKAGES_ROOT,
    importManifest = defaultImportManifest,
    log = (message) => process.stdout.write(`${message}\n`),
  } = options;

  const contracts = await listContractPackages(packagesRoot);
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
