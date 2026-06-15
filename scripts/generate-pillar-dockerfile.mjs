#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');

/**
 * Generates the Dockerfile for a per-pillar `-api` app under
 * `apps/pops-<pillar>-api/Dockerfile`.
 *
 * Why generated: every per-pillar Dockerfile was hand-copying the `src/`
 * + `migrations/` of every other pillar's `-db` and `-contract` package,
 * causing unrelated rebuilds (PRD-252 / audit H-D1). Phase 1 still needs
 * every workspace `package.json` so pnpm install resolves the lockfile;
 * Phase 2 narrows source copies to the pillar's transitive `@pops/*`
 * dependencies; Phase 3 builds those deps in pnpm topology order via
 * `pnpm --filter "@pops/<pillar>-api^..." build` (the same selector
 * #3285 introduced for CI).
 *
 * Usage: node scripts/generate-pillar-dockerfile.mjs <pillar>
 * Example: node scripts/generate-pillar-dockerfile.mjs core
 */

const SOURCE_CANDIDATES = [
  'src',
  'scripts',
  'migrations',
  'openapi',
  'tsconfig.json',
  'tsconfig.build.json',
];

/**
 * Read the full workspace package set so pnpm install can resolve.
 * @param {string} repoRoot
 * @returns {string[]} repo-relative paths, sorted
 */
export function listWorkspacePackagePaths(repoRoot) {
  const raw = execFileSync('pnpm', ['m', 'ls', '--json', '--depth', '-1'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return parseWorkspacePackagePaths(raw, repoRoot);
}

/**
 * Pure parser for `pnpm m ls --json --depth -1` output.
 * @param {string} raw
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function parseWorkspacePackagePaths(raw, repoRoot) {
  const entries = JSON.parse(raw);
  return entries
    .filter((e) => e.name && e.name !== '@pops/monorepo' && e.path)
    .map((e) => relative(repoRoot, e.path))
    .toSorted();
}

/**
 * Resolve every transitive `@pops/*` workspace dep of the target pillar
 * (including the target itself), with repo-relative paths.
 * @param {string} repoRoot
 * @param {string} pkgName e.g. "@pops/core-api"
 * @returns {{ name: string, path: string }[]}
 */
export function listPillarTransitiveDeps(repoRoot, pkgName) {
  const raw = execFileSync(
    'pnpm',
    ['m', 'ls', '--filter', `${pkgName}...`, '--json', '--depth', '-1'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return parsePillarTransitiveDeps(raw, repoRoot);
}

/**
 * Pure parser for the filtered `pnpm m ls` output.
 * @param {string} raw
 * @param {string} repoRoot
 * @returns {{ name: string, path: string }[]}
 */
export function parsePillarTransitiveDeps(raw, repoRoot) {
  const entries = JSON.parse(raw);
  return entries
    .filter(
      (e) =>
        typeof e.name === 'string' &&
        e.name.startsWith('@pops/') &&
        e.name !== '@pops/monorepo' &&
        e.path
    )
    .map((e) => ({
      name: e.name,
      path: relative(repoRoot, e.path),
    }));
}

/**
 * For a workspace package directory, return the list of paths to COPY
 * during Phase 2 (source code, tsconfig variants, migrations, openapi).
 * Only paths that actually exist on disk are emitted so the Dockerfile
 * is deterministic against the current tree.
 * @param {string} repoRoot
 * @param {string} pkgDir repo-relative
 * @returns {string[]}
 */
export function copySourcesFor(repoRoot, pkgDir) {
  const abs = resolve(repoRoot, pkgDir);
  return SOURCE_CANDIDATES.filter((c) => existsSync(join(abs, c))).map((c) => `${pkgDir}/${c}`);
}

/**
 * Pure Dockerfile renderer. Does not touch the filesystem.
 *
 * @param {object} args
 * @param {string} args.pillar pillar slug (e.g. "core")
 * @param {string[]} args.allWorkspacePaths every workspace package dir
 *   (repo-relative), sorted. Used for Phase 1 package.json COPY lines.
 * @param {{ name: string, path: string, sources: string[] }[]} args.sharedDeps
 *   transitive `@pops/*` deps EXCLUDING the target app, each with the
 *   already-resolved Phase 2 source COPY paths (repo-relative).
 * @param {string[]} args.appSources source paths inside the target app
 *   dir to COPY (repo-relative).
 * @returns {string}
 */
export function renderDockerfile({ pillar, allWorkspacePaths, sharedDeps, appSources }) {
  const appDir = `apps/pops-${pillar}-api`;
  const appPkgName = `@pops/${pillar}-api`;
  const lines = [];
  const push = (s = '') => lines.push(s);

  push(`# DO NOT EDIT — regenerate with:`);
  push(`#   node scripts/generate-pillar-dockerfile.mjs ${pillar}`);
  push(`# CI drift-check (.github/workflows/docker-build.yml) fails on hand-edits.`);
  push(`# PRD-252 / audit H-D1.`);
  push(``);
  push(`FROM node:22-slim AS builder`);
  push(`WORKDIR /app`);
  push(``);
  push(`# Workspace root manifests — needed for pnpm install to resolve.`);
  push(`COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .oxfmtrc.json ./`);
  push(``);
  push(`# Phase 1: every workspace package.json. pnpm-workspace.yaml lists every`);
  push(`# member; if any are missing at install time pnpm fails with`);
  push(`# ERR_PNPM_WORKSPACE_PKG_NOT_FOUND. src/ + migrations/ for non-transitive`);
  push(`# packages are intentionally NOT copied (PRD-252 / audit H-D1).`);
  for (const p of allWorkspacePaths) {
    push(`COPY ${p}/package.json ./${p}/`);
  }
  push(``);
  push(`# Install pnpm + every workspace dependency.`);
  push(`RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \\`);
  push(`    corepack enable && pnpm install --frozen-lockfile`);
  push(``);
  push(`# Phase 2: sources for the transitive @pops/* deps of ${appPkgName}`);
  push(`# (resolved via \`pnpm m ls --filter "${appPkgName}..." --json\`).`);
  push(`# A change in a non-listed package does NOT invalidate this image's`);
  push(`# Phase 2 layer.`);
  for (const dep of sharedDeps) {
    if (dep.sources.length === 0) continue;
    push(`# ${dep.name}`);
    for (const src of dep.sources) {
      push(`COPY ${src} ./${src}`);
    }
  }
  push(``);
  push(`# Pillar app sources.`);
  for (const src of appSources) {
    push(`COPY ${src} ./${src}`);
  }
  push(``);
  push(`# Phase 3: build shared deps in pnpm topology order, then the app.`);
  push(`# \`^...\` expands to every dependency of the target excluding the target,`);
  push(`# letting pnpm compute build order from the lockfile (see #3285).`);
  push(`RUN pnpm --filter "${appPkgName}^..." build`);
  push(`RUN pnpm --filter "${appPkgName}" build`);
  push(``);
  push(`# Standalone deployment (production deps only, no symlinks).`);
  push(`RUN pnpm --filter ${appPkgName} deploy --prod --legacy /app/deploy`);
  push(``);
  push(`FROM node:22-slim`);
  push(`WORKDIR /app`);
  push(
    `RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*`
  );
  push(``);
  push(`COPY --from=builder --chown=node:node /app/deploy ./`);
  push(`COPY --from=builder --chown=node:node /app/${appDir}/dist ./dist`);
  push(``);
  push(`ARG BUILD_VERSION=dev`);
  push(`ENV BUILD_VERSION=$BUILD_VERSION`);
  push(``);
  push(`EXPOSE 3001`);
  push(`USER node`);
  push(`CMD ["node", "dist/server.js"]`);
  push(``);

  return lines.join('\n');
}

/**
 * High-level orchestrator: narrows the per-pillar source list with
 * `sourcesFor`, then renders the Dockerfile. Pure modulo the injected
 * dependencies — `sourcesFor` is the only side-effectful seam.
 *
 * @param {object} args
 * @param {string} args.pillar
 * @param {string[]} args.allWorkspacePaths
 * @param {{ name: string, path: string }[]} args.transitiveDeps
 *   includes the target itself
 * @param {(pkgDir: string) => string[]} args.sourcesFor
 * @returns {string}
 */
export function generateDockerfile({ pillar, allWorkspacePaths, transitiveDeps, sourcesFor }) {
  const appDir = `apps/pops-${pillar}-api`;
  const appPkgName = `@pops/${pillar}-api`;

  const transitivePaths = new Set(transitiveDeps.map((d) => d.path));
  if (!transitivePaths.has(appDir)) {
    throw new Error(`pnpm did not return the target app ${appPkgName} in its dependency graph`);
  }

  const sharedDeps = transitiveDeps
    .filter((d) => d.path !== appDir)
    .toSorted((a, b) => a.path.localeCompare(b.path))
    .map((d) => ({ ...d, sources: sourcesFor(d.path) }));

  const appSources = sourcesFor(appDir);

  return renderDockerfile({
    pillar,
    allWorkspacePaths,
    sharedDeps,
    appSources,
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const pillar = process.argv[2];
  if (!pillar) {
    console.error('Usage: generate-pillar-dockerfile.mjs <pillar>');
    console.error('Example: generate-pillar-dockerfile.mjs core');
    process.exit(1);
  }

  const appDir = `apps/pops-${pillar}-api`;
  const appPkgName = `@pops/${pillar}-api`;

  if (!existsSync(resolve(REPO_ROOT, appDir, 'package.json'))) {
    console.error(`pillar app not found: ${appDir}/package.json`);
    process.exit(1);
  }

  const allWorkspacePaths = listWorkspacePackagePaths(REPO_ROOT);
  const transitiveDeps = listPillarTransitiveDeps(REPO_ROOT, appPkgName);
  const sourcesFor = (pkgDir) => copySourcesFor(REPO_ROOT, pkgDir);

  const dockerfile = generateDockerfile({
    pillar,
    allWorkspacePaths,
    transitiveDeps,
    sourcesFor,
  });

  const outputPath = resolve(REPO_ROOT, appDir, 'Dockerfile');
  writeFileSync(outputPath, dockerfile);
  const sharedCount = transitiveDeps.filter((d) => d.path !== appDir).length;
  console.log(`wrote ${relative(REPO_ROOT, outputPath)} (${sharedCount} transitive @pops/* deps)`);
}
