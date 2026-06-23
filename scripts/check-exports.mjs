#!/usr/bin/env node
/**
 * Exports/files self-consistency gate (ISO-EXPORTS, P6-T02).
 *
 * The resolution-time complement to the ISO-R3 dep-cruiser rule
 * (docs/plans/repo-federation/04-isolation-enforcement.md §3): dep-cruiser
 * rules are advisory unless a package *physically cannot* be imported wrong.
 * The `exports` map + `files` whitelist enforce the contract at resolution
 * time, identically in-workspace and post-extraction. This script proves the
 * manifest is *honest* about that surface — it does not invent or widen it.
 *
 * For every workspace unit (a `libs` dir, a `pillars` dir, or a pillar's
 * nested `app` dir, each carrying a package.json) it asserts:
 *
 *   1. every `exports` subpath target resolves to a file that exists on disk
 *      (every condition branch — `types`/`default`/`import`/`require`/string
 *      shorthand — is checked);
 *   2. every `main`/`module`/`types`/`typings` target exists;
 *   3. if a `files` array is present, every `exports`/`main`/`types` target
 *      falls under one of its globs — the **extraction firewall**: a target
 *      outside `files` would 404 once the package is packed/extracted;
 *   4. no `"./*"` catch-all that re-exports the whole tree, except the audited
 *      wide surfaces (`@pops/ui` `./primitives/*`, `@pops/locales` asset tree);
 *   5. `version` is a real (publishable) semver, even though workspace deps
 *      consume it as `workspace:*`.
 *
 * Discovery is disk-derived (no static unit list — principle P-8) so a new
 * pillar/lib is gated automatically. Compiled units (`main`/exports pointing at
 * `dist/`) require a prior build; a missing `dist` target is reported as a
 * resolution failure with a build hint rather than silently skipped.
 *
 * Usage:
 *   node scripts/check-exports.mjs
 *   node scripts/check-exports.mjs --self-test
 *
 * Exit 0 = every unit's manifest is self-consistent. Exit 1 = at least one
 * inconsistency. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * Audited wide-surface exceptions to the `"./*"`-catch-all ban
 * (04-isolation-enforcement.md §3). Each entry is a package name mapped to the
 * set of wildcard export *keys* it is permitted to declare. Anything else with
 * a `*` in the key is a violation. Keep this set tiny and justified.
 *
 *   - `@pops/ui` `./primitives/*` — the one audited intentional wide surface
 *     (a design-system primitive barrel; consumers cherry-pick primitives).
 *   - `@pops/locales` `./*` — a pure JSON asset tree consumed as
 *     `@pops/locales/<locale>/<ns>.json`; the package *is* its asset surface,
 *     there is no compiled/internal half to hide.
 *
 * @type {Record<string, Set<string>>}
 */
const ALLOWED_WILDCARD_EXPORTS = {
  '@pops/ui': new Set(['./primitives/*']),
  '@pops/locales': new Set(['./*']),
};

/**
 * Workspace roots scanned for units. `pillars/*` are nested (a pillar may
 * carry an `app/` frontend unit one level deep); `libs/*` are flat.
 *
 * @type {Array<{ root: string; nested: boolean }>}
 */
const UNIT_ROOTS = [
  { root: 'pillars', nested: true },
  { root: 'libs', nested: false },
];

/** SemVer (major.minor.patch + optional pre-release / build metadata). */
const SEMVER_RE =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

/**
 * @typedef {object} Unit
 * @property {string} dir   Repo-relative dir, e.g. `libs/types`.
 * @property {string} name  Published package name, e.g. `@pops/types`.
 * @property {Record<string, unknown>} pkg  Parsed package.json.
 */

/**
 * Read a package.json and return its `name` + parsed object, or `null` if the
 * file is absent or the package is unnamed (un-publishable, not a unit).
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
 * Discover every named workspace unit from disk.
 *
 * @returns {Unit[]}
 */
function discoverUnits() {
  /** @type {Unit[]} */
  const out = [];
  for (const { root, nested } of UNIT_ROOTS) {
    const absRoot = join(repoRoot, root);
    if (!existsSync(absRoot)) continue;
    for (const entry of readdirSync(absRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = `${root}/${entry.name}`;
      const read = readPkg(join(absRoot, entry.name));
      if (read) out.push({ dir, name: read.name, pkg: read.pkg });
      if (nested) {
        const appDir = `${dir}/app`;
        const appRead = readPkg(join(absRoot, entry.name, 'app'));
        if (appRead) out.push({ dir: appDir, name: appRead.name, pkg: appRead.pkg });
      }
    }
  }
  return out.toSorted((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * @typedef {'export'|'entry'} TargetKind
 *   `export` — declared in the `exports` map (the published contract surface;
 *   must be `./`-prefixed per the exports spec). `entry` — a `main`/`module`/
 *   `types`/`typings` field (npm accepts a bare relative path here, e.g.
 *   `src/index.ts`, as well as `./src/index.ts`).
 */

/**
 * @typedef {object} Target
 * @property {string} field      Where the target came from, e.g. `exports["./x"].types` or `main`.
 * @property {string} relPath    Unit-relative POSIX path the manifest declares, e.g. `./dist/x.js`.
 * @property {TargetKind} kind
 */

/**
 * Walk an `exports` value (string | conditions object | nested subpath object)
 * and collect every concrete file target it points at. Wildcard targets
 * (containing `*`) are returned with `relPath` ending in `*` so the caller can
 * resolve them against the directory rather than a single file.
 *
 * @param {unknown} value     The exports value (or a nested condition object).
 * @param {string} keyPath    Human-readable provenance, e.g. `exports["./x"]`.
 * @param {Target[]} out
 */
function collectExportTargets(value, keyPath, out) {
  if (typeof value === 'string') {
    out.push({ field: keyPath, relPath: value, kind: 'export' });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [cond, inner] of Object.entries(value)) {
      collectExportTargets(inner, `${keyPath}.${cond}`, out);
    }
  }
}

/**
 * True if the export *key* is a subpath entry (starts with `.`) — as opposed
 * to a condition name like `types`/`default`. The top-level `exports` object
 * may be either a flat conditions map (`{ types, default }` — the `.` shorthand)
 * or a subpath map (`{ ".": …, "./x": … }`); a key starting with `.` marks the
 * latter.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isSubpathKey(key) {
  return key.startsWith('.');
}

/**
 * Reduce a manifest target path to its unit-relative form: strips a leading
 * `./` (exports targets) or treats it as already unit-relative (a bare
 * `main`/`types` like `src/index.ts`). Wildcards are kept intact.
 *
 * @param {string} relPath   Manifest target, e.g. `./dist/x.js` or `src/index.ts`.
 * @returns {string}         Unit-relative path, e.g. `dist/x.js` / `src/index.ts`.
 */
function toUnitRelative(relPath) {
  return relPath.replace(/^\.\//u, '');
}

/**
 * Resolve a manifest target path to a repo-relative path under the unit dir.
 *
 * @param {string} unitDir   Repo-relative unit dir, e.g. `libs/types`.
 * @param {string} relPath   Manifest target, e.g. `./dist/x.js` or `src/index.ts`.
 * @returns {string}         Repo-relative path, e.g. `libs/types/dist/x.js`.
 */
function resolveTarget(unitDir, relPath) {
  return `${unitDir}/${toUnitRelative(relPath)}`;
}

/**
 * True if a manifest target is a usable relative path. Exports targets MUST be
 * `./`-prefixed (the exports spec rejects bare specifiers — a bare `dist/x.js`
 * in an exports map is invalid and would not resolve). `main`/`types` entries
 * may be bare relative (`src/index.ts`) or `./`-prefixed; either resolves. An
 * absolute path, a URL scheme, or a `node_modules`/parent escape is rejected
 * for both.
 *
 * @param {string} relPath
 * @param {TargetKind} kind
 * @returns {boolean}
 */
function isUsableRelativeTarget(relPath, kind) {
  if (typeof relPath !== 'string' || relPath.length === 0) return false;
  if (relPath.startsWith('/') || /^[a-z]+:/iu.test(relPath)) return false;
  if (relPath.startsWith('../') || relPath.includes('/../')) return false;
  if (kind === 'export') return relPath.startsWith('./');
  return true;
}

/**
 * Check whether a (possibly-wildcard) target exists on disk. A non-wildcard
 * target must be an existing file. A wildcard target (`./src/primitives/*` →
 * dir `src/primitives`, `./*` → the unit root) must resolve to an existing
 * directory — the wildcard's reachable surface.
 *
 * @param {string} repoRelTarget  Repo-relative path, possibly ending in a `*` segment.
 * @returns {boolean}
 */
function targetExists(repoRelTarget) {
  const abs = join(repoRoot, repoRelTarget);
  if (repoRelTarget.includes('*')) {
    const dir = dirname(abs.replace(/\/\*.*$/u, '/_'));
    return existsSync(dir) && statSync(dir).isDirectory();
  }
  return existsSync(abs) && statSync(abs).isFile();
}

/**
 * Convert a `files` glob entry into a predicate over unit-relative paths.
 * Supports the subset npm actually honours that this repo uses: a bare dir or
 * file name (`dist`), a `dir/**` recursive glob, and an exact path
 * (`openapi/x.json`). A leading `./` is tolerated. Anything matched is treated
 * as "covered by files".
 *
 * @param {string} glob  A `files` entry, e.g. `dist/contract/**` or `openapi/x.json`.
 * @returns {(unitRelPath: string) => boolean}
 */
function filesGlobMatcher(glob) {
  const norm = glob.replace(/^\.\//u, '').replace(/\/+$/u, '');
  if (norm.endsWith('/**')) {
    const prefix = norm.slice(0, -3);
    return (p) => p === prefix || p.startsWith(`${prefix}/`);
  }
  if (norm.includes('*')) {
    const prefix = norm.slice(0, norm.indexOf('*'));
    return (p) => p.startsWith(prefix);
  }
  return (p) => p === norm || p.startsWith(`${norm}/`);
}

/**
 * @typedef {object} UnitReport
 * @property {string} name
 * @property {string[]} errors
 */

/**
 * Validate one unit's manifest. Pure (no process exit) so it is unit-testable.
 *
 * @param {Unit} unit
 * @param {(repoRelTarget: string) => boolean} [exists]  File/dir existence probe
 *   (injectable for tests; defaults to the on-disk probe).
 * @returns {UnitReport}
 */
export function checkUnit(unit, exists = targetExists) {
  /** @type {string[]} */
  const errors = [];
  const { pkg, dir, name } = unit;

  const version = pkg.version;
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
    errors.push(`version is not a publishable semver: ${JSON.stringify(version)}`);
  }

  /** @type {Target[]} */
  const targets = [];

  for (const field of ['main', 'module', 'types', 'typings']) {
    const value = pkg[field];
    if (typeof value === 'string') targets.push({ field, relPath: value, kind: 'entry' });
  }

  const exportsField = pkg.exports;
  const allowedWildcards = ALLOWED_WILDCARD_EXPORTS[name] ?? new Set();

  if (exportsField && typeof exportsField === 'object') {
    const keys = Object.keys(exportsField);
    const isSubpathMap = keys.some(isSubpathKey);
    if (isSubpathMap) {
      for (const [key, value] of Object.entries(exportsField)) {
        if (key.includes('*') && !allowedWildcards.has(key)) {
          errors.push(
            `exports key "${key}" is a wildcard catch-all (forbidden — exposes the whole tree). ` +
              `Declare each public subpath explicitly.`
          );
        }
        collectExportTargets(value, `exports["${key}"]`, targets);
      }
    } else {
      collectExportTargets(exportsField, 'exports', targets);
    }
  }

  for (const target of targets) {
    if (!isUsableRelativeTarget(target.relPath, target.kind)) {
      const why =
        target.kind === 'export'
          ? 'exports targets must be a "./"-prefixed relative path'
          : 'must be a relative path inside the package';
      errors.push(`${target.field} target ${JSON.stringify(target.relPath)} is invalid (${why})`);
      continue;
    }
    // The `"./package.json": "./package.json"` self-reference is tautological —
    // the file is the manifest we just parsed; never a resolution risk.
    if (target.relPath === './package.json') continue;
    const repoRel = resolveTarget(dir, target.relPath);
    if (!exists(repoRel)) {
      const hint = repoRel.includes('/dist/')
        ? ' (compiled target — run the unit build first)'
        : '';
      errors.push(`${target.field} → ${target.relPath} does not exist${hint}`);
    }
  }

  const filesField = pkg.files;
  const hasFiles = Array.isArray(filesField) && filesField.length > 0;

  // Compiled units (any export/entry target lands under `dist/`) MUST carry a
  // `files` whitelist — the extraction firewall (04-isolation-enforcement.md §3
  // invariant table). Without it `npm pack` ships the whole tree, defeating the
  // contract boundary. Source units (targets under `src/`) ship whole and need
  // none, so the requirement keys on "points at dist", not on unit location.
  const isCompiled = targets.some((t) => toUnitRelative(t.relPath).startsWith('dist/'));
  if (isCompiled && !hasFiles) {
    errors.push(
      'compiled unit (exports/main point at dist/) has no "files" whitelist — ' +
        'the extraction firewall is missing; add e.g. "files": ["dist/**"].'
    );
  }

  if (hasFiles) {
    const matchers = filesField.filter((g) => typeof g === 'string').map(filesGlobMatcher);
    for (const target of targets) {
      if (!isUsableRelativeTarget(target.relPath, target.kind)) continue;
      if (target.relPath === './package.json') continue;
      const unitRel = toUnitRelative(target.relPath).replace(/\/\*.*$/u, '');
      const covered = matchers.some((m) => m(unitRel));
      if (!covered) {
        errors.push(
          `${target.field} → ${target.relPath} is not covered by "files" ` +
            `(would be unreachable after pack/extract — the extraction firewall)`
        );
      }
    }
  }

  return { name, errors };
}

/**
 * Synthetic fixtures proving the gate catches each failure mode and passes a
 * clean unit. Mirrors the `--self-test` convention in
 * check-lib-no-pillar-import.mjs / check-pillar-schema-coverage.mjs so a
 * regression that neuters the gate is caught without a real tree break.
 *
 * @returns {boolean} true if the gate behaves correctly on the fixtures.
 */
function selfTest() {
  /** @type {Set<string>} */
  const present = new Set(['libs/clean/dist/index.js', 'libs/clean/dist/index.d.ts']);
  /** @type {(p: string) => boolean} */
  const exists = (p) => present.has(p) || (p.includes('*') && p.startsWith('libs/clean/dist'));

  const clean = checkUnit(
    {
      dir: 'libs/clean',
      name: '@pops/clean',
      pkg: {
        version: '0.1.0',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
          '.': { types: './dist/index.d.ts', default: './dist/index.js' },
          './package.json': './package.json',
        },
        files: ['dist/**'],
      },
    },
    exists
  );

  const missingTarget = checkUnit(
    {
      dir: 'libs/missing',
      name: '@pops/missing',
      pkg: {
        version: '0.1.0',
        exports: { '.': { default: './dist/gone.js' } },
      },
    },
    exists
  );

  const outsideFiles = checkUnit(
    {
      dir: 'libs/clean',
      name: '@pops/leaky',
      pkg: {
        version: '0.1.0',
        exports: { './secret': { default: './src/secret.js' } },
        files: ['dist/**'],
      },
    },
    () => true
  );

  const wildcard = checkUnit(
    {
      dir: 'libs/wide',
      name: '@pops/wide',
      pkg: { version: '0.1.0', exports: { './*': './src/*' } },
    },
    () => true
  );

  const badVersion = checkUnit(
    { dir: 'libs/v', name: '@pops/v', pkg: { version: 'workspace:*', exports: {} } },
    () => true
  );

  // A source unit with a *bare* relative `main` (npm-valid: `src/index.ts`,
  // no `./`) and no exports/files must pass — this is the common source-lib /
  // app-pillar shape and must NOT be a false positive.
  const bareMain = checkUnit(
    { dir: 'libs/src-lib', name: '@pops/src-lib', pkg: { version: '0.1.0', main: 'src/index.ts' } },
    (p) => p === 'libs/src-lib/src/index.ts'
  );

  // A *bare* (non-`./`) target inside the exports map is invalid per the
  // exports spec and must be flagged even though it would be fine as `main`.
  const bareExport = checkUnit(
    {
      dir: 'libs/bad-export',
      name: '@pops/bad-export',
      pkg: { version: '0.1.0', exports: { '.': 'dist/index.js' } },
    },
    () => true
  );

  // A compiled unit (exports point at dist/) WITHOUT a files whitelist is
  // missing the extraction firewall and must be flagged.
  const compiledNoFiles = checkUnit(
    {
      dir: 'libs/compiled',
      name: '@pops/compiled',
      pkg: { version: '0.1.0', exports: { '.': { default: './dist/index.js' } } },
    },
    () => true
  );

  const checks = {
    'clean unit passes': clean.errors.length === 0,
    'missing exports target flagged': missingTarget.errors.some((e) =>
      e.includes('does not exist')
    ),
    'target outside files flagged': outsideFiles.errors.some((e) =>
      e.includes('not covered by "files"')
    ),
    'wildcard catch-all flagged': wildcard.errors.some((e) => e.includes('wildcard catch-all')),
    'non-semver version flagged': badVersion.errors.some((e) => e.includes('publishable semver')),
    'bare-relative main passes': bareMain.errors.length === 0,
    'bare exports target flagged': bareExport.errors.some((e) => e.includes('is invalid')),
    'compiled-without-files flagged': compiledNoFiles.errors.some((e) =>
      e.includes('extraction firewall is missing')
    ),
  };

  const ok = Object.values(checks).every(Boolean);
  if (!ok) {
    console.error('SELF-TEST FAILED — gate did not behave as expected:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  } else {
    console.log(
      'self-test OK — gate flags missing target / outside-files / wildcard / bad version / bare export, ' +
        'passes clean + bare-main units.'
    );
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/check-exports.mjs [--self-test]\n' +
        'Asserts every workspace unit’s exports/main/types targets exist and fall under its files whitelist.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const units = discoverUnits();
  /** @type {UnitReport[]} */
  const failing = [];
  for (const unit of units) {
    const report = checkUnit(unit);
    if (report.errors.length > 0) failing.push(report);
  }

  console.log(`Checked ${units.length} unit(s).`);
  if (failing.length === 0) {
    console.log('OK — every unit’s exports/files manifest is self-consistent.');
    process.exit(0);
  }

  console.error(`FAIL — ${failing.length} unit(s) with manifest inconsistencies:`);
  for (const report of failing) {
    console.error(`\n  ${report.name}:`);
    for (const err of report.errors) console.error(`    - ${err}`);
  }
  console.error(
    '\nThe exports map + files whitelist is the contract surface (04-isolation-enforcement.md §3). ' +
      'A target that is missing, or reachable but excluded from files, breaks resolution after extraction.'
  );
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
