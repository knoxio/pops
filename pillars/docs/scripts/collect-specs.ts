/**
 * Collect every pillar's OpenAPI snapshot into the pops-docs image build
 * context (spec: pillars/docs/docs/prds/swagger-container).
 *
 * Walks `pillars/*` from the monorepo root. For each pillar:
 *   - if `openapi/<pillar>.openapi.json` exists → emit a catalog entry,
 *     copy the spec into `dist/openapi/<pillar>.json`
 *   - otherwise → skip (the pillar ships no contract snapshot; that is
 *     not an error)
 *
 * Discovery keys off the pillar directory and the presence of its OpenAPI
 * file. Pillar package metadata (`package.json`) is optional: Rust pillars
 * (e.g. `contacts`) ship a `Cargo.toml` and no `package.json`, and still
 * get a catalog entry sourced from the OpenAPI `info` block.
 *
 * The output `catalog.json` is what `src/index.html` reads at runtime to
 * populate Stoplight Elements' multi-spec navigation. There is no runtime
 * registry dependency: the catalog snapshot reflects the contracts that
 * existed at image build time, so a container redeploy reflects the latest
 * contracts.
 *
 * `generatedAt` records the current git commit sha when the build is
 * inside a git checkout, otherwise the ISO timestamp — handy when the
 * image is built from a release tarball where `.git` is absent.
 */
import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
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
const PILLARS_DIR = resolve(REPO_ROOT, 'pillars');
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
 * Read a pillar's `package.json` for its npm name/version when present.
 * Rust pillars ship a `Cargo.toml` and no `package.json`; callers fall
 * back to the OpenAPI `info` block for those.
 */
function readPillarPackage(pkgJsonPath: string): ContractPackageJson | null {
  if (!existsSync(pkgJsonPath)) return null;
  try {
    return readJson<ContractPackageJson>(pkgJsonPath);
  } catch {
    return null;
  }
}

/**
 * Build a catalog entry for pillar `id` if it ships a readable
 * `openapi/<id>.openapi.json`, otherwise `null` (the pillar has no
 * contract snapshot yet — not an error). Package metadata falls back to
 * the OpenAPI `info` block so Rust pillars without a `package.json` still
 * get a usable name/version.
 */
function collectPillar(id: string): CollectedContract | null {
  const pillarDir = resolve(PILLARS_DIR, id);
  const openapiPath = resolve(pillarDir, 'openapi', `${id}.openapi.json`);

  let snapshot: OpenApiSnapshot;
  try {
    statSync(openapiPath);
    snapshot = readJson<OpenApiSnapshot>(openapiPath);
  } catch {
    return null;
  }

  const pkg = readPillarPackage(resolve(pillarDir, 'package.json'));

  return {
    id,
    packageName: pkg?.name ?? snapshot.info?.title ?? `@pops/${id}`,
    packageVersion: pkg?.version ?? snapshot.info?.version ?? '0.0.0',
    sourcePath: openapiPath,
    snapshot,
  };
}

/**
 * Discover every `pillars/<id>` directory that ships an OpenAPI snapshot
 * at `openapi/<id>.openapi.json`. Pure filesystem walk — no workspace
 * manifest required. A missing `pillars/` directory degrades to an empty
 * catalog rather than throwing, so the build never dies on `ENOENT`.
 */
function discoverContracts(): CollectedContract[] {
  if (!existsSync(PILLARS_DIR)) {
    console.warn(`[pops-docs] no pillars directory at ${PILLARS_DIR} — catalog will be empty`);
    return [];
  }

  const collected: CollectedContract[] = [];
  for (const entry of readdirSync(PILLARS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const contract = collectPillar(entry.name);
    if (contract) collected.push(contract);
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
