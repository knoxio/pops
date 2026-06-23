#!/usr/bin/env node
/**
 * Bundle-map completeness guard (P7-T08 / RD-10).
 *
 * The shell renders every in-repo pillar's UI by static-importing its
 * published `@pops/app-<pillar>` package from a single hand-maintained
 * `bundle-map.tsx`. ADR-002 keeps this static on purpose — the in-repo FE
 * is one optimized Vite SPA, module federation was explicitly rejected, and
 * importing the published `@pops/app-*` package (never the pillar's `src/`)
 * is contract-respecting. The cost is a hand-edit: add an in-repo pillar app
 * and forget the bundle-map entry, and its UI silently vanishes with no
 * error. This guard makes that omission loud at CI time.
 *
 * What it does:
 *   1. Discover every in-repo pillar app by walking `pillars/<x>/app/package.json`
 *      and reading its `name` (expected `@pops/app-<pillar>`). This is the set
 *      the bundle map MUST reference. Discovered from disk — never a hardcoded
 *      pillar list, which is the exact static-rot this whole phase kills.
 *   2. Locate the shell's `bundle-map.tsx` and extract the `@pops/app-*`
 *      package specifiers it imports, via the shared statement-anchored
 *      specifier extractor (`scripts/ci/import-scan.mjs`) so a package name
 *      inside a comment or string literal does NOT count.
 *   3. Assert every discovered `@pops/app-*` package appears in the bundle
 *      map. Exit non-zero with a per-package message listing any gap; exit 0
 *      when complete.
 *
 * It deliberately ignores non-`@pops/app-*` imports the bundle map also
 * pulls in (e.g. `@pops/overlay-ego`, a frontend-only lib that is not a
 * pillar app and lives in `libs/`, not `pillars/<x>/app`). The contract this
 * guard enforces is one-directional: every pillar app must be referenced;
 * the bundle map may reference other things too.
 *
 * The `import.meta.glob` over `pillars/<x>/app/src` alternative is rejected
 * by design: it reaches behind the `@pops/app-*` contract into `src/`
 * (ISO-R3 violation). This guard exists precisely to keep the static,
 * contract-respecting bundle map honest without that hack.
 *
 * Usage:
 *   node scripts/check-bundle-map-coverage.mjs              check the real tree
 *   node scripts/check-bundle-map-coverage.mjs --self-test  prove the guard catches a gap
 *
 * Exit code 0 on full coverage. Non-zero on any uncovered pillar app, on a
 * failed self-test, or on usage / discovery errors.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractSpecifiers } from './ci/import-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/** Package-name prefix every in-repo pillar app must carry. */
const APP_PACKAGE_PREFIX = '@pops/app-';

/**
 * Candidate locations for the shell's static bundle map, relative to the
 * repo root, in priority order. The first that exists wins. The shell's
 * post-relocation home is `pillars/shell`; the legacy `apps/pops-shell`
 * path is kept as a fallback so the guard does not silently no-op if the
 * relocation order shifts.
 */
const BUNDLE_MAP_CANDIDATES = [
  'pillars/shell/src/app/bundle-map.tsx',
  'apps/pops-shell/src/app/bundle-map.tsx',
];

/**
 * @typedef {object} PillarApp
 * @property {string} pkgName  npm package name, e.g. `@pops/app-finance`.
 * @property {string} pkgPath  Repo-relative `package.json` path that declared it.
 */

/**
 * Discover every in-repo pillar app from disk by walking
 * `pillars/<x>/app/package.json` and reading its `name`. The result is the set
 * of `@pops/app-*` packages the bundle map must reference. No hardcoded list.
 *
 * A `pillars/<x>/app/package.json` whose `name` does not start with
 * `@pops/app-` is a malformed app and is reported loudly rather than skipped —
 * the convention (`@pops/app-<pillar>`) is what the shell relies on.
 *
 * @returns {PillarApp[]}
 */
function discoverPillarApps() {
  const pillarsRoot = join(repoRoot, 'pillars');
  if (!existsSync(pillarsRoot)) return [];
  /** @type {PillarApp[]} */
  const out = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join('pillars', entry.name, 'app', 'package.json');
    if (!existsSync(join(repoRoot, pkgPath))) continue;
    /** @type {{ name?: unknown }} */
    const pkg = JSON.parse(readFileSync(join(repoRoot, pkgPath), 'utf8'));
    if (typeof pkg.name !== 'string') {
      throw new Error(`${pkgPath} has no string \`name\` field`);
    }
    if (!pkg.name.startsWith(APP_PACKAGE_PREFIX)) {
      throw new Error(
        `${pkgPath} declares name "${pkg.name}" — every pillar app must be ` +
          `named "${APP_PACKAGE_PREFIX}<pillar>" so the shell can static-import it.`
      );
    }
    out.push({ pkgName: pkg.name, pkgPath });
  }
  return out.toSorted((a, b) => a.pkgName.localeCompare(b.pkgName));
}

/**
 * Locate the shell bundle map on disk and return its repo-relative path.
 *
 * @returns {string}
 */
function locateBundleMap() {
  for (const candidate of BUNDLE_MAP_CANDIDATES) {
    if (existsSync(join(repoRoot, candidate))) return candidate;
  }
  throw new Error(
    `bundle-map.tsx not found. Looked in: ${BUNDLE_MAP_CANDIDATES.join(', ')}. ` +
      `If the shell moved, add its path to BUNDLE_MAP_CANDIDATES.`
  );
}

/**
 * The set of `@pops/app-*` package specifiers a bundle-map source actually
 * imports. Uses the shared statement-anchored extractor so a specifier that
 * merely appears inside a comment or string literal is NOT counted.
 *
 * @param {string} src
 * @returns {Set<string>}
 */
export function referencedAppPackages(src) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const specifier of extractSpecifiers(src)) {
    if (specifier.startsWith(APP_PACKAGE_PREFIX)) out.add(specifier);
  }
  return out;
}

/**
 * @typedef {object} CoverageResult
 * @property {string[]} missing  Pillar-app package names absent from the bundle map.
 * @property {string[]} covered  Pillar-app package names present in the bundle map.
 */

/**
 * Pure core: assert every discovered pillar-app package is referenced by the
 * bundle map. Pure (no I/O) so the self-test can drive it over in-memory
 * fixtures.
 *
 * @param {PillarApp[]} apps        Discovered pillar apps (must be referenced).
 * @param {Set<string>} referenced  `@pops/app-*` specifiers the bundle map imports.
 * @returns {CoverageResult}
 */
export function evaluateCoverage(apps, referenced) {
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const covered = [];
  for (const app of apps) {
    if (referenced.has(app.pkgName)) covered.push(app.pkgName);
    else missing.push(app.pkgName);
  }
  return { missing, covered };
}

/**
 * Drive the guard against the real tree.
 *
 * @returns {boolean} true on full coverage.
 */
function run() {
  const apps = discoverPillarApps();
  if (apps.length === 0) {
    console.error(
      'No pillar apps discovered under pillars/*/app with a package.json. Nothing to check.'
    );
    return false;
  }
  const bundleMapPath = locateBundleMap();
  const referenced = referencedAppPackages(readFileSync(join(repoRoot, bundleMapPath), 'utf8'));
  const { missing, covered } = evaluateCoverage(apps, referenced);

  console.log(
    `Discovered ${apps.length} pillar app(s); ${bundleMapPath} references ` +
      `${referenced.size} @pops/app-* package(s).`
  );
  for (const name of covered) console.log(`  OK  ${name}`);

  if (missing.length === 0) {
    console.log('OK — every pillar app is referenced by the shell bundle map.');
    return true;
  }

  console.error(`FAIL — ${missing.length} pillar app(s) missing from ${bundleMapPath}:`);
  for (const name of missing) {
    console.error(`  XX  ${name} — add \`import { manifest } from '${name}'\` and a map entry.`);
  }
  console.error(
    `  Without an entry the pillar's UI silently fails to mount. ADR-002 keeps ` +
      `${bundleMapPath} static; this guard keeps it complete.`
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard catches a gap and passes a complete
 * map. Mirrors the `--self-test` convention in check-exports.mjs /
 * check-pillar-schema-coverage.mjs so a regression that neuters the guard is
 * caught without a real tree break.
 *
 * @returns {boolean} true if the guard behaves correctly on the fixtures.
 */
function selfTest() {
  /** @type {PillarApp[]} */
  const apps = [
    { pkgName: '@pops/app-alpha', pkgPath: 'pillars/alpha/app/package.json' },
    { pkgName: '@pops/app-beta', pkgPath: 'pillars/beta/app/package.json' },
  ];

  const completeMap = [
    "import { manifest as a } from '@pops/app-alpha';",
    "import { manifest as b } from '@pops/app-beta';",
    "import { manifest as e } from '@pops/overlay-ego';",
  ].join('\n');

  // beta is only present in a comment and a string literal — the statement
  // anchored extractor must NOT count either, so the gap is still caught.
  const gappedMap = [
    "import { manifest as a } from '@pops/app-alpha';",
    "// import { manifest as b } from '@pops/app-beta';",
    "const doc = 'see @pops/app-beta for the missing one';",
  ].join('\n');

  const complete = evaluateCoverage(apps, referencedAppPackages(completeMap));
  const gapped = evaluateCoverage(apps, referencedAppPackages(gappedMap));

  const checks = {
    'complete map passes (no missing)': complete.missing.length === 0,
    'complete map covers both apps': complete.covered.length === 2,
    'gap detected (beta missing)':
      gapped.missing.length === 1 && gapped.missing[0] === '@pops/app-beta',
    'commented / stringified specifier does not count': gapped.covered.length === 1,
    'non-app import ignored': !complete.covered.includes('@pops/overlay-ego'),
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard passes a complete map, flags a missing app, and ' +
        'ignores commented / stringified / non-app specifiers.'
    );
  } else {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/check-bundle-map-coverage.mjs [--self-test]\n' +
        'Asserts every in-repo pillars/*/app package is referenced by the shell bundle-map.tsx.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  process.exit(run() ? 0 : 1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
