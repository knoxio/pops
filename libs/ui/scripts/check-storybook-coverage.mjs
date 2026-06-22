#!/usr/bin/env node
/**
 * Asserts that every frontend `@pops/app-*` workspace package is enumerated as
 * a Vite source alias in `libs/ui/.storybook/main.ts`.
 *
 * Storybook is `@pops/ui`'s dev surface (P2-T04): it renders pillar-frontend
 * stories and resolves the `@pops/app-*` specifiers those stories reach
 * through to each pillar's `app/src` via Vite `resolve.alias`. The alias —
 * not a `package.json` devDependency — is how the dev surface consumes the
 * frontends: a `ui → app-*` workspace edge would both trip the federation
 * isolation guard (scripts/ci/check-lib-no-pillar-import.mjs) and form a turbo
 * `^build` cycle, since every `@pops/app-*` depends on `@pops/ui`.
 *
 * A package is considered a frontend surface (and therefore eligible for
 * Storybook) if its name is `@pops/app-*` and it has `src/routes.tsx`.
 * Server-only siblings and the overlay package are excluded by that filter.
 *
 * Frontend app packages are colocated inside their owning pillar at
 * `pillars/<pillar>/app/` (PRD-253); discovery walks those pillar app dirs.
 *
 * Fails (exit 1) on any missing alias so future drift surfaces in CI instead
 * of waiting for someone to file a story and find it cannot resolve the
 * pillar it renders (issue #2706).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const PILLARS_DIR = resolve(REPO_ROOT, 'pillars');
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

function readAliases() {
  const source = readFileSync(STORYBOOK_MAIN, 'utf8');
  const matches = source.matchAll(/find:\s*'(@pops\/app-[a-z0-9-]+)'/g);
  return [...matches].map((m) => m[1]);
}

const expected = listFrontendAppPackages();
const aliases = new Set(readAliases());

const missingAliases = expected.filter((name) => !aliases.has(name));

if (missingAliases.length === 0) {
  process.stdout.write(
    `@pops/ui storybook aliases all ${expected.length} frontend @pops/app-* packages.\n`
  );
  process.exit(0);
}

console.error('Missing Vite aliases in libs/ui/.storybook/main.ts:');
for (const name of missingAliases) console.error(`  - ${name}`);
console.error('\nAdd a `resolve.alias` for the package above so its stories load in Storybook.');
process.exit(1);
