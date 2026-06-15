#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const PILLAR = process.argv[2];
if (!PILLAR) {
  console.error('Usage: generate-pillar-dockerfile.mjs <pillar>');
  console.error('Example: generate-pillar-dockerfile.mjs core');
  process.exit(1);
}

const APP_DIR = join('apps', `pops-${PILLAR}-api`);
const APP_PKG_NAME = `@pops/${PILLAR}-api`;

const appPkgPath = resolve(REPO_ROOT, APP_DIR, 'package.json');
if (!existsSync(appPkgPath)) {
  console.error(`pillar app not found: ${APP_DIR}/package.json`);
  process.exit(1);
}

/** Read the full workspace package set so pnpm install can resolve. */
function listWorkspacePackagePaths() {
  const raw = execFileSync('pnpm', ['m', 'ls', '--json', '--depth', '-1'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const entries = JSON.parse(raw);
  return entries
    .filter((e) => e.name && e.name !== '@pops/monorepo' && e.path)
    .map((e) => relative(REPO_ROOT, e.path))
    .toSorted();
}

/**
 * Resolve every transitive `@pops/*` workspace dep of the target pillar
 * (including the target itself), with repo-relative paths.
 */
function listPillarTransitiveDeps() {
  const raw = execFileSync(
    'pnpm',
    ['m', 'ls', '--filter', `${APP_PKG_NAME}...`, '--json', '--depth', '-1'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
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
      path: relative(REPO_ROOT, e.path),
    }));
}

const allWorkspacePaths = listWorkspacePackagePaths();
const transitiveDeps = listPillarTransitiveDeps();
const transitiveDepPaths = new Set(transitiveDeps.map((d) => d.path));

if (!transitiveDepPaths.has(APP_DIR)) {
  console.error(`pnpm did not return the target app ${APP_PKG_NAME} in its dependency graph`);
  process.exit(1);
}

const sharedDeps = transitiveDeps
  .filter((d) => d.path !== APP_DIR)
  .toSorted((a, b) => a.path.localeCompare(b.path));

/**
 * For a workspace package directory, return the list of paths to COPY
 * during Phase 2 (source code, tsconfig variants, migrations, openapi).
 * Only paths that actually exist on disk are emitted so the Dockerfile
 * is deterministic against the current tree.
 */
function copySourcesFor(pkgDir) {
  const abs = resolve(REPO_ROOT, pkgDir);
  const candidates = [
    'src',
    'scripts',
    'migrations',
    'openapi',
    'tsconfig.json',
    'tsconfig.build.json',
  ];
  return candidates.filter((c) => existsSync(join(abs, c))).map((c) => `${pkgDir}/${c}`);
}

const lines = [];
const push = (s = '') => lines.push(s);

push(`# DO NOT EDIT — regenerate with:`);
push(`#   node scripts/generate-pillar-dockerfile.mjs ${PILLAR}`);
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
push(`# Phase 2: sources for the transitive @pops/* deps of ${APP_PKG_NAME}`);
push(`# (resolved via \`pnpm m ls --filter "${APP_PKG_NAME}..." --json\`).`);
push(`# A change in a non-listed package does NOT invalidate this image's`);
push(`# Phase 2 layer.`);
for (const dep of sharedDeps) {
  const sources = copySourcesFor(dep.path);
  if (sources.length === 0) continue;
  push(`# ${dep.name}`);
  for (const src of sources) {
    push(`COPY ${src} ./${src}`);
  }
}
push(``);
push(`# Pillar app sources.`);
for (const src of copySourcesFor(APP_DIR)) {
  push(`COPY ${src} ./${src}`);
}
push(``);
push(`# Phase 3: build shared deps in pnpm topology order, then the app.`);
push(`# \`^...\` expands to every dependency of the target excluding the target,`);
push(`# letting pnpm compute build order from the lockfile (see #3285).`);
push(`RUN pnpm --filter "${APP_PKG_NAME}^..." build`);
push(`RUN pnpm --filter "${APP_PKG_NAME}" build`);
push(``);
push(`# Standalone deployment (production deps only, no symlinks).`);
push(`RUN pnpm --filter ${APP_PKG_NAME} deploy --prod --legacy /app/deploy`);
push(``);
push(`FROM node:22-slim`);
push(`WORKDIR /app`);
push(
  `RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*`
);
push(``);
push(`COPY --from=builder --chown=node:node /app/deploy ./`);
push(`COPY --from=builder --chown=node:node /app/${APP_DIR}/dist ./dist`);
push(``);
push(`ARG BUILD_VERSION=dev`);
push(`ENV BUILD_VERSION=$BUILD_VERSION`);
push(``);
push(`EXPOSE 3001`);
push(`USER node`);
push(`CMD ["node", "dist/server.js"]`);
push(``);

const outputPath = resolve(REPO_ROOT, APP_DIR, 'Dockerfile');
writeFileSync(outputPath, lines.join('\n'));
console.log(
  `wrote ${relative(REPO_ROOT, outputPath)} (${sharedDeps.length} transitive @pops/* deps)`
);
