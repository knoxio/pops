/**
 * Theme 13 PRD-219 — collect every contract package's OpenAPI snapshot
 * into the pops-docs image build context.
 *
 * Walks `packages/*-contract/` from the monorepo root. For each contract:
 *   - if `openapi/<pillar>.openapi.json` exists → emit a catalog entry,
 *     copy the spec into `apps/pops-docs/dist/openapi/<pillar>.json`
 *   - otherwise → log a warning and skip (the contract is in flight but
 *     hasn't generated its snapshot yet; that is not an error)
 *
 * The output `catalog.json` is what `src/index.html` reads at runtime to
 * populate Stoplight Elements' multi-spec navigation. There is no runtime
 * registry dependency: the catalog snapshot reflects the contracts that
 * existed at image build time, which is exactly the deploy semantics the
 * PRD calls for (a container redeploy reflects the latest contracts).
 *
 * `generatedAt` records the current git commit sha when the build is
 * inside a git checkout, otherwise the ISO timestamp — handy when the
 * image is built from a release tarball where `.git` is absent.
 */
import { execSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCatalog,
  type CollectedContract,
  type ContractPackageJson,
  type OpenApiSnapshot,
} from '../src/catalog.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const PACKAGES_DIR = resolve(REPO_ROOT, 'packages');
const SRC_DIR = resolve(APP_ROOT, 'src');
const OUT_DIR = resolve(APP_ROOT, 'dist');
const OUT_OPENAPI_DIR = resolve(OUT_DIR, 'openapi');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function resolveGitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Discover every `packages/*-contract` directory that ships an OpenAPI
 * snapshot. Pure filesystem walk — no workspace manifest required.
 */
function discoverContracts(): CollectedContract[] {
  const entries = readdirSync(PACKAGES_DIR, { withFileTypes: true });
  const collected: CollectedContract[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith('-contract')) continue;

    const id = entry.name.replace(/-contract$/, '');
    const pkgDir = resolve(PACKAGES_DIR, entry.name);
    const pkgJsonPath = resolve(pkgDir, 'package.json');
    const openapiPath = resolve(pkgDir, 'openapi', `${id}.openapi.json`);

    let pkg: ContractPackageJson;
    try {
      pkg = readJson<ContractPackageJson>(pkgJsonPath);
    } catch {
      console.warn(`[pops-docs] skipping ${entry.name}: package.json unreadable`);
      continue;
    }

    let snapshot: OpenApiSnapshot;
    try {
      statSync(openapiPath);
      snapshot = readJson<OpenApiSnapshot>(openapiPath);
    } catch {
      console.warn(
        `[pops-docs] skipping ${entry.name}: no openapi snapshot at openapi/${id}.openapi.json`
      );
      continue;
    }

    collected.push({
      id,
      packageName: pkg.name,
      packageVersion: pkg.version,
      sourcePath: openapiPath,
      snapshot,
    });
  }

  return collected.toSorted((a, b) => a.id.localeCompare(b.id));
}

function main(): void {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_OPENAPI_DIR, { recursive: true });

  const contracts = discoverContracts();
  if (contracts.length === 0) {
    console.warn('[pops-docs] no contract OpenAPI snapshots discovered — catalog will be empty');
  }

  for (const contract of contracts) {
    const dest = resolve(OUT_OPENAPI_DIR, `${contract.id}.json`);
    cpSync(contract.sourcePath, dest);
  }

  const catalog = buildCatalog({ generatedAt: resolveGitSha(), contracts });
  writeFileSync(resolve(OUT_DIR, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);

  for (const staticFile of ['index.html', 'styles.css'] as const) {
    cpSync(resolve(SRC_DIR, staticFile), resolve(OUT_DIR, staticFile));
  }

  process.stdout.write(`[pops-docs] catalog ready — ${catalog.contracts.length} contract(s)\n`);
  for (const entry of catalog.contracts) {
    process.stdout.write(`  - ${entry.id}@${entry.version} → ${entry.openapiPath}\n`);
  }
}

main();
