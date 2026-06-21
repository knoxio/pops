#!/usr/bin/env node
/**
 * Asserts that every frontend `@pops/app-*` workspace package is enumerated
 * both as a dependency of `apps/pops-storybook` and as a Vite alias in
 * `.storybook/main.ts`.
 *
 * A package is considered a frontend surface (and therefore eligible for
 * Storybook) if its name is `@pops/app-*` and it has `src/routes.tsx`.
 * Server-only siblings and the overlay package are excluded by that filter.
 *
 * Frontend app packages are colocated inside their owning pillar at
 * `pillars/<pillar>/app/` (PRD-253); discovery walks those pillar app dirs.
 *
 * Fails (exit 1) on any missing dep or alias so future drift surfaces in CI
 * instead of waiting for someone to file a story and find the dep missing
 * (issue #2706).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const PILLARS_DIR = resolve(REPO_ROOT, 'pillars');
const STORYBOOK_PKG = resolve(__dirname, '../package.json');
const STORYBOOK_MAIN = resolve(__dirname, '../.storybook/main.ts');

function listFrontendAppPackages() {
  return readdirSync(PILLARS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(PILLARS_DIR, entry.name, 'app'))
    .filter((appDir) => {
      try {
        statSync(resolve(appDir, 'src/routes.tsx'));
        return true;
      } catch {
        return false;
      }
    })
    .map((appDir) => JSON.parse(readFileSync(resolve(appDir, 'package.json'), 'utf8')).name)
    .filter((name) => typeof name === 'string' && name.startsWith('@pops/app-'))
    .toSorted();
}

function readDeps() {
  const pkg = JSON.parse(readFileSync(STORYBOOK_PKG, 'utf8'));
  return Object.keys(pkg.dependencies ?? {});
}

function readAliases() {
  const source = readFileSync(STORYBOOK_MAIN, 'utf8');
  const matches = source.matchAll(/find:\s*'(@pops\/app-[a-z0-9-]+)'/g);
  return [...matches].map((m) => m[1]);
}

const expected = listFrontendAppPackages();
const deps = new Set(readDeps());
const aliases = new Set(readAliases());

const missingDeps = expected.filter((name) => !deps.has(name));
const missingAliases = expected.filter((name) => !aliases.has(name));

if (missingDeps.length === 0 && missingAliases.length === 0) {
  process.stdout.write(
    `pops-storybook covers all ${expected.length} frontend @pops/app-* packages.\n`
  );
  process.exit(0);
}

if (missingDeps.length > 0) {
  console.error('Missing dependencies in apps/pops-storybook/package.json:');
  for (const name of missingDeps) console.error(`  - ${name}`);
}
if (missingAliases.length > 0) {
  console.error('Missing Vite aliases in apps/pops-storybook/.storybook/main.ts:');
  for (const name of missingAliases) console.error(`  - ${name}`);
}
console.error('\nAdd the package above to both places so its stories load in Storybook.');
process.exit(1);
