#!/usr/bin/env node
/**
 * Federation isolation guard: **a LIB must never depend on a PILLAR.**
 *
 * The two-kind taxonomy (docs/plans/repo-federation/00-architecture.md §1):
 *   - PILLAR — a deployable, self-registering capability provider, consumed
 *     ONLY through its published contract (runtime REST + discovery).
 *   - LIB    — code that facilitates pillars existing; consumed by import of
 *     its published name. Always extractable to its own repo.
 *
 * A lib that imports a pillar fails the extract-to-own-repo litmus (§3): the
 * pillar would not be present in the extracted repo. So a lib may depend on
 * other libs and on a pillar's *published types* (its `@pops/<pillar>`
 * contract entrypoint is allowed for type-only contract consumption only via
 * other pillars, never libs) — but a lib taking a runtime dependency on, or
 * importing the source of, a pillar is forbidden.
 *
 * This is the diff-agnostic whole-tree pass run by `agent-review.yml`. It is
 * deliberately disk-discovered (no static unit list — principle P-8): the
 * pillar/lib classification is derived from the live tree so it stays correct
 * across the federation relocation (units live under `apps/`+`packages/`
 * today, `pillars/`+`libs/` after the move).
 *
 * Classification (by location — survives the relocation):
 *   PILLAR : any package under `pillars/` (incl. `pillars/<x>/app`), plus the
 *            app-pillars still parked under `apps/` (shell, mcp, orchestrator,
 *            docs) until P2-T02 moves them.
 *   LIB    : any package under `libs/` or `packages/`.
 *   ignored: `apps/pops-cli` (dropped, P2-T02), `apps/pops-storybook` (folds
 *            into `libs/ui` as a dev surface, P2-T04 — it legitimately
 *            devDepends on the `app-*` frontends, so it is NOT a lib here).
 *
 * What counts as a violation for a lib:
 *   - a pillar `@pops/*` name in `dependencies` or `peerDependencies`  (HARD)
 *   - a pillar `@pops/*` name in `devDependencies`                     (unless
 *     allowlisted — see ALLOWED_DEV_PILLAR_DEPS)
 *   - an `import`/`export … from`/`import()`/`require()` of a pillar in the
 *     lib's non-test source                                            (HARD)
 *
 * Usage:
 *   node scripts/ci/check-lib-no-pillar-import.mjs
 *   node scripts/ci/check-lib-no-pillar-import.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one violation. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractSpecifiers } from './import-scan.mjs';

export { extractSpecifiers };

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Known-vestigial pillar devDependencies that are tolerated until their
 * owning decoupling task lands. `@pops/module-registry` devDepends on all 8
 * backend pillars only to type-check its committed `generated.ts` manifest;
 * those devDeps are dropped in **P7-T01 (alias RD-1)**. Remove a lib's entry
 * here in the same PR that drops the deps — leaving a stale allowlist entry
 * is itself a smell.
 *
 * Keyed by the lib's published `@pops/*` name → set of allowed pillar
 * `@pops/*` devDependency names.
 *
 * @type {Record<string, Set<string>>}
 */
const ALLOWED_DEV_PILLAR_DEPS = {
  '@pops/module-registry': new Set([
    '@pops/ai',
    '@pops/cerebrum',
    '@pops/core',
    '@pops/finance',
    '@pops/food',
    '@pops/inventory',
    '@pops/lists',
    '@pops/media',
  ]),
};

/** Workspace roots scanned for units, paired with how they classify. */
const UNIT_ROOTS = [
  { root: 'pillars', defaultKind: 'pillar', nested: true },
  { root: 'libs', defaultKind: 'lib', nested: false },
  { root: 'packages', defaultKind: 'lib', nested: false },
  { root: 'apps', defaultKind: 'app', nested: false },
];

/** Basenames under `apps/` whose target home is `pillars/` (P2-T02). */
const APP_PILLAR_DIRS = new Set(['pops-shell', 'pops-mcp', 'pops-orchestrator', 'pops-docs']);

/** Source file extensions whose imports are inspected. */
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

/** Directory names never followed when walking a unit's source. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.turbo']);

/**
 * @typedef {object} Unit
 * @property {string} dir   Repo-relative dir, e.g. `packages/ui`.
 * @property {string} name  Published package name, e.g. `@pops/ui`.
 * @property {'pillar'|'lib'} kind
 * @property {Record<string, unknown>} pkg  Parsed package.json.
 */

/**
 * Read a package.json and return its `name`, or `null` if absent/unnamed.
 *
 * @param {string} absDir
 * @returns {{ name: string; pkg: Record<string, unknown> } | null}
 */
function readPkg(absDir) {
  const pkgPath = join(absDir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  /** @type {Record<string, unknown>} */
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const name = typeof pkg.name === 'string' ? pkg.name : '';
  if (!name) return null;
  return { name, pkg };
}

/**
 * Discover every classified unit from disk. App-pillars under `apps/` are
 * reclassified to `pillar`; `apps/pops-cli` and `apps/pops-storybook` are
 * dropped (not units for this rule).
 *
 * @returns {Unit[]}
 */
function discoverUnits() {
  /** @type {Unit[]} */
  const out = [];
  for (const { root, defaultKind, nested } of UNIT_ROOTS) {
    const absRoot = join(repoRoot, root);
    if (!existsSync(absRoot)) continue;
    for (const entry of readdirSync(absRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = `${root}/${entry.name}`;
      const read = readPkg(join(absRoot, entry.name));
      if (read) {
        /** @type {'pillar'|'lib'|null} */
        let kind = defaultKind === 'app' ? null : defaultKind;
        if (defaultKind === 'app') {
          if (APP_PILLAR_DIRS.has(entry.name)) kind = 'pillar';
          else continue; // cli (dropped) / storybook (folds into libs/ui)
        }
        if (kind) out.push({ dir, name: read.name, kind, pkg: read.pkg });
      }
      // Pillar frontends live one level deep at `pillars/<x>/app`.
      if (nested) {
        const appDir = join(absRoot, entry.name, 'app');
        const appRead = readPkg(appDir);
        if (appRead) {
          out.push({ dir: `${dir}/app`, name: appRead.name, kind: 'pillar', pkg: appRead.pkg });
        }
      }
    }
  }
  return out.toSorted((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * Recursively collect inspectable source files under `absDir`, skipping
 * build output, node_modules, and test files (a lib's test importing a
 * pillar is a dev concern, not a runtime-isolation break).
 *
 * @param {string} absDir
 * @returns {string[]}
 */
function walkSource(absDir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(absDir)) return out;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name === '__tests__') continue;
      out.push(...walkSource(join(absDir, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (/\.(test|spec)\.[cm]?[jt]sx?$/u.test(name)) continue;
    const dot = name.lastIndexOf('.');
    if (dot < 0 || !SOURCE_EXT.has(name.slice(dot))) continue;
    out.push(join(absDir, name));
  }
  return out;
}

/**
 * True if `specifier` resolves to (the root of, or a subpath of) `pkgName`.
 *
 * @param {string} specifier
 * @param {string} pkgName
 * @returns {boolean}
 */
function specifierTargets(specifier, pkgName) {
  return specifier === pkgName || specifier.startsWith(`${pkgName}/`);
}

/**
 * @typedef {object} Violation
 * @property {string} lib     Offending lib package name.
 * @property {string} pillar  Pillar package name reached.
 * @property {string} via     `dependencies` | `peerDependencies` | `devDependencies` | source file path.
 */

/**
 * Pure detector — find every lib→pillar dependency/import. Exported for tests.
 *
 * @param {Unit[]} units
 * @param {(unit: Unit) => string[]} [readSource]  Maps a lib unit to its source
 *   strings; defaults to reading the lib's non-test source from disk.
 * @param {Record<string, Set<string>>} [allowedDevDeps]
 * @returns {Violation[]}
 */
export function findViolations(units, readSource, allowedDevDeps = ALLOWED_DEV_PILLAR_DEPS) {
  const pillarNames = new Set(units.filter((u) => u.kind === 'pillar').map((u) => u.name));
  const libs = units.filter((u) => u.kind === 'lib');
  /** @type {Violation[]} */
  const violations = [];

  const readSrc =
    readSource ??
    ((unit) => walkSource(join(repoRoot, unit.dir)).map((f) => readFileSync(f, 'utf8')));

  for (const lib of libs) {
    const allowed = allowedDevDeps[lib.name] ?? new Set();
    for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
      const deps = lib.pkg[field];
      if (!deps || typeof deps !== 'object') continue;
      for (const dep of Object.keys(deps)) {
        if (!pillarNames.has(dep)) continue;
        if (field === 'devDependencies' && allowed.has(dep)) continue;
        violations.push({ lib: lib.name, pillar: dep, via: field });
      }
    }
    for (const src of readSrc(lib)) {
      for (const spec of extractSpecifiers(src)) {
        for (const pillar of pillarNames) {
          if (specifierTargets(spec, pillar)) {
            violations.push({ lib: lib.name, pillar, via: `import ${spec}` });
          }
        }
      }
    }
  }
  return violations;
}

/**
 * Self-test: prove the detector flags a synthetic lib→pillar dependency and
 * import, and passes a clean fixture. Mirrors the `--inject-fake-table`
 * pattern in check-pillar-schema-coverage.mjs — CI runs this so a regression
 * that neuters the guard is caught without relying on a real tree violation.
 *
 * @returns {boolean} true if the guard behaves correctly.
 */
function selfTest() {
  /** @type {Unit[]} */
  const fixture = [
    { dir: 'pillars/finance', name: '@pops/finance', kind: 'pillar', pkg: {} },
    {
      dir: 'libs/evil',
      name: '@pops/evil',
      kind: 'lib',
      pkg: { dependencies: { '@pops/finance': 'workspace:*' } },
    },
    {
      dir: 'libs/evil-import',
      name: '@pops/evil-import',
      kind: 'lib',
      pkg: {},
    },
    { dir: 'libs/clean', name: '@pops/clean', kind: 'lib', pkg: { dependencies: {} } },
  ];
  /** @type {(u: Unit) => string[]} */
  const readSource = (u) =>
    u.name === '@pops/evil-import' ? ["import { x } from '@pops/finance/dist/x.js';"] : [];

  const found = findViolations(fixture, readSource, {});
  const caughtDep = found.some((v) => v.lib === '@pops/evil' && v.via === 'dependencies');
  const caughtImport = found.some(
    (v) => v.lib === '@pops/evil-import' && v.via.startsWith('import ')
  );
  const cleanPassed = !found.some((v) => v.lib === '@pops/clean');
  const ok = caughtDep && caughtImport && cleanPassed;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  caught dep violation:    ${caughtDep}`);
    console.error(`  caught import violation: ${caughtImport}`);
    console.error(`  clean lib passed:        ${cleanPassed}`);
  } else {
    console.log('self-test OK — guard flags lib→pillar dep + import, passes clean lib.');
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-lib-no-pillar-import.mjs [--self-test]\n' +
        'Fails if any lib (libs/* or packages/*) depends on or imports a pillar.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const units = discoverUnits();
  const libs = units.filter((u) => u.kind === 'lib');
  const pillars = units.filter((u) => u.kind === 'pillar');
  console.log(`Scanned ${libs.length} lib(s) against ${pillars.length} pillar(s).`);

  const violations = findViolations(units);
  if (violations.length === 0) {
    console.log('OK — no lib depends on or imports a pillar.');
    process.exit(0);
  }
  console.error(`FAIL — ${violations.length} lib→pillar violation(s):`);
  for (const v of violations.toSorted((a, b) => a.lib.localeCompare(b.lib))) {
    console.error(`  ${v.lib} → ${v.pillar}  (${v.via})`);
  }
  console.error(
    '\nA lib must be extractable to its own repo (00-architecture.md §3). ' +
      'Consume a pillar only through its REST contract at runtime, never as a ' +
      'workspace dependency or source import.'
  );
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
