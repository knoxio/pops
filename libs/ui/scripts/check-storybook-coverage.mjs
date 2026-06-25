#!/usr/bin/env node
/**
 * Asserts that every frontend `@pops/app-*` workspace package is enumerated as
 * a Vite source alias in `libs/ui/.storybook/main.ts`, AND that each alias's
 * replacement path resolves to that package's real `app/src` directory.
 *
 * Storybook is `@pops/ui`'s dev surface (P2-T04): it renders pillar-frontend
 * stories and resolves the `@pops/app-*` specifiers those stories reach
 * through to each pillar's `app/src` via Vite `resolve.alias`. The alias —
 * not a `package.json` devDependency — is how the dev surface consumes the
 * frontends: a `ui → app-*` workspace edge would both trip the federation
 * isolation guard (scripts/ci/check-lib-no-pillar-import.mjs) and form a
 * `tsc -b` project-reference cycle, since every `@pops/app-*` depends on
 * `@pops/ui`.
 *
 * A package is considered a frontend surface (and therefore eligible for
 * Storybook) if its name is `@pops/app-*` and it has `src/routes.tsx`.
 * Server-only siblings and the overlay package are excluded by that filter.
 *
 * Frontend app packages are colocated inside their owning pillar at
 * `pillars/<pillar>/app/` (PRD-253); discovery walks those pillar app dirs.
 *
 * Two failure modes are caught (exit 1):
 *   1. A frontend package with NO alias — its stories cannot resolve the
 *      pillar they render (issue #2706).
 *   2. An alias whose `replacement` points at a missing or WRONG directory —
 *      e.g. `@pops/app-ai` mapped at `pillars/registry/app/src` (which does
 *      not exist) instead of `pillars/ai/app/src`. The original key-only check
 *      passed this silently; the alias only breaks once an AI-pillar story is
 *      filed. Validating the resolved path makes that drift loud at CI time.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const PILLARS_DIR = resolve(REPO_ROOT, 'pillars');
const STORYBOOK_DIR = resolve(__dirname, '../.storybook');
const STORYBOOK_MAIN = resolve(STORYBOOK_DIR, 'main.ts');

/**
 * Discover frontend app packages: each pillar's `app/` dir that has a
 * `src/routes.tsx` and a `@pops/app-*` package name. Returns the package name
 * paired with the absolute `app/src` dir its Storybook alias must resolve to.
 *
 * @returns {{ name: string, srcDir: string }[]}
 */
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
    .map((appDir) => ({
      name: JSON.parse(readFileSync(resolve(appDir, 'package.json'), 'utf8')).name,
      srcDir: resolve(appDir, 'src'),
    }))
    .filter((pkg) => typeof pkg.name === 'string' && pkg.name.startsWith('@pops/app-'))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse `@pops/app-*` aliases from `main.ts`, resolving each
 * `path.resolve(__dirname, '<rel>')` replacement (relative to the `.storybook`
 * dir, which is `main.ts`'s own `__dirname`) to an absolute path.
 *
 * @returns {{ name: string, replacement: string }[]}
 */
function readAliases() {
  const source = readFileSync(STORYBOOK_MAIN, 'utf8');
  const pattern =
    /find:\s*'(@pops\/app-[a-z0-9-]+)'\s*,\s*replacement:\s*path\.resolve\(\s*__dirname\s*,\s*'([^']+)'\s*\)/g;
  return [...source.matchAll(pattern)].map((m) => ({
    name: m[1],
    replacement: resolve(STORYBOOK_DIR, m[2]),
  }));
}

const expected = listFrontendAppPackages();
const aliases = readAliases();
const aliasByName = new Map(aliases.map((a) => [a.name, a]));

/** @type {string[]} */
const errors = [];

for (const pkg of expected) {
  const alias = aliasByName.get(pkg.name);
  if (!alias) {
    errors.push(
      `${pkg.name}: no Vite alias in .storybook/main.ts — its stories cannot resolve the pillar they render.`
    );
    continue;
  }
  if (!existsSync(alias.replacement)) {
    errors.push(
      `${pkg.name}: alias points at a non-existent path ${alias.replacement} — expected ${pkg.srcDir}.`
    );
  } else if (alias.replacement !== pkg.srcDir) {
    errors.push(
      `${pkg.name}: alias points at the wrong pillar ${alias.replacement} — expected ${pkg.srcDir}.`
    );
  }
}

if (errors.length === 0) {
  process.stdout.write(
    `@pops/ui storybook aliases all ${expected.length} frontend @pops/app-* packages to their app/src.\n`
  );
  process.exit(0);
}

console.error('Storybook alias problems in libs/ui/.storybook/main.ts:');
for (const message of errors) console.error(`  - ${message}`);
console.error(
  '\nEach @pops/app-* frontend needs a `resolve.alias` whose replacement is its own `pillars/<pillar>/app/src`.'
);
process.exit(1);
