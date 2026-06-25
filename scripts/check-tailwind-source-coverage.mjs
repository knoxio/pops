#!/usr/bin/env node
/**
 * Tailwind `@source` coverage guard.
 *
 * The whole in-repo FE is one Vite/Tailwind build. Tailwind v4 only generates
 * a utility class if it finds that class in a scanned source file. Because the
 * single theme entry `libs/ui/src/theme/globals.css` lives inside the `libs/ui`
 * package, Tailwind's automatic detection only covers `libs/ui`; every other
 * package is pulled in by explicit `@source` globs in that file. Tailwind does
 * NOT error when an `@source` glob matches zero files — so a stale glob (e.g.
 * the `apps/*` / `packages/*` globs left behind by the pillars/libs rename)
 * silently stops generating most utilities and the UI collapses with no build
 * error. This guard makes that failure loud at CI time.
 *
 * What it checks:
 *   1. EMPTY GLOBS — every `@source` glob in globals.css must match at least
 *      one real file. A glob that matches nothing is the rename-rot this guard
 *      exists to catch.
 *   2. UNCOVERED SOURCE — no `className`-bearing `.tsx`/`.jsx`/`.mdx` file under
 *      `pillars/` or `libs/` may fall outside every glob's reach. The globs only
 *      match `{ts,tsx}` under a `src/` dir, so a UI file authored outside `src/`
 *      or as `.jsx`/`.mdx` would silently lose its styling. (`.storybook/` is
 *      exempt: its decorator classes are plain CSS selectors from globals.css,
 *      not scanned utilities.)
 *
 * Usage:
 *   node scripts/check-tailwind-source-coverage.mjs              check the real tree
 *   node scripts/check-tailwind-source-coverage.mjs --self-test  prove the guard catches rot
 *
 * Exit 0 when every glob is non-empty and every UI file is covered; non-zero on
 * any empty glob, any uncovered file, a failed self-test, or a discovery error.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const GLOBALS_CSS = resolve(repoRoot, 'libs/ui/src/theme/globals.css');

/** Extensions of files that can author Tailwind utility classes via JSX. */
const UI_EXTENSIONS = new Set(['.tsx', '.jsx', '.mdx']);
/** Extensions worth indexing at all (UI files plus `.ts` for glob-match counting). */
const INDEX_EXTENSIONS = new Set(['.ts', '.tsx', '.jsx', '.mdx']);
/** Directory names never walked. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'storybook-static',
  '.turbo',
]);

/**
 * Extract the raw `@source` glob strings from a globals.css source.
 *
 * @param {string} css
 * @returns {string[]}
 */
export function parseSources(css) {
  return [...css.matchAll(/@source\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/**
 * Compile a filesystem glob (supporting `**`, `*`, `?`, and `{a,b}` brace
 * lists) into an anchored RegExp matched against absolute POSIX-style paths.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?'; // `**/` — zero or more path segments
        } else {
          re += '.*'; // `**` — anything, including `/`
        }
      } else {
        re += '[^/]*'; // `*` — anything within a single segment
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      const inner = glob
        .slice(i + 1, end)
        .split(',')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      re += `(?:${inner})`;
      i = end;
    } else if ('.+^$()|[]\\'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * The directory to start walking for a glob: the static prefix before its
 * first metacharacter.
 *
 * @param {string} absGlob
 * @returns {string}
 */
function globBaseDir(absGlob) {
  const metaIdx = absGlob.search(/[*?{]/);
  const prefix = metaIdx === -1 ? absGlob : absGlob.slice(0, metaIdx);
  return prefix.endsWith('/') ? prefix.slice(0, -1) : dirname(prefix);
}

/**
 * Recursively collect indexable files under `dir`. Reads contents only for UI
 * files (to flag `className` usage); `.ts` files are indexed path-only so glob
 * emptiness can still count them without reading thousands of files.
 *
 * @param {string} dir
 * @param {Map<string, { path: string, ext: string, hasClassName: boolean }>} out
 */
function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (!INDEX_EXTENSIONS.has(ext)) continue;
    const path = join(dir, entry.name);
    if (out.has(path)) continue;
    const hasClassName = UI_EXTENSIONS.has(ext) && readFileSync(path, 'utf8').includes('className');
    out.set(path, { path, ext, hasClassName });
  }
}

/**
 * @typedef {object} CoverageResult
 * @property {string[]} emptyGlobs  Globs that matched zero indexed files.
 * @property {string[]} uncovered   `className`-bearing UI files matched by no glob.
 */

/**
 * Pure core: given absolute `@source` globs and an indexed file list, find
 * globs that match nothing and UI files matched by no glob. No I/O, so the
 * self-test can drive it over synthetic fixtures.
 *
 * @param {string[]} absGlobs
 * @param {{ path: string, ext: string, hasClassName: boolean }[]} files
 * @returns {CoverageResult}
 */
export function evaluateCoverage(absGlobs, files) {
  const compiled = absGlobs.map((glob) => ({ glob, re: globToRegExp(glob) }));
  const emptyGlobs = compiled
    .filter(({ re }) => !files.some((f) => re.test(f.path)))
    .map(({ glob }) => glob);
  const uncovered = files
    .filter(
      (f) =>
        UI_EXTENSIONS.has(f.ext) &&
        f.hasClassName &&
        !f.path.includes('/.storybook/') &&
        !compiled.some(({ re }) => re.test(f.path))
    )
    .map((f) => f.path);
  return { emptyGlobs, uncovered };
}

/**
 * Drive the guard against the real tree.
 *
 * @returns {boolean} true when every glob is non-empty and every UI file is covered.
 */
function run() {
  if (!existsSync(GLOBALS_CSS)) {
    console.error(`globals.css not found at ${GLOBALS_CSS}.`);
    return false;
  }
  const cssDir = dirname(GLOBALS_CSS);
  const rawGlobs = parseSources(readFileSync(GLOBALS_CSS, 'utf8'));
  if (rawGlobs.length === 0) {
    console.error(
      `No @source globs found in ${GLOBALS_CSS}. Expected explicit pillar/lib sources.`
    );
    return false;
  }
  const absGlobs = rawGlobs.map((g) => resolve(cssDir, g));

  const baseDirs = new Set([resolve(repoRoot, 'pillars'), resolve(repoRoot, 'libs')]);
  for (const g of absGlobs) baseDirs.add(globBaseDir(g));

  /** @type {Map<string, { path: string, ext: string, hasClassName: boolean }>} */
  const index = new Map();
  for (const dir of baseDirs) walk(dir, index);
  const files = [...index.values()];

  const { emptyGlobs, uncovered } = evaluateCoverage(absGlobs, files);

  console.log(
    `Checked ${rawGlobs.length} @source glob(s) against ${files.length} indexed file(s).`
  );
  for (const g of rawGlobs) {
    const abs = resolve(cssDir, g);
    if (!emptyGlobs.includes(abs)) console.log(`  OK    ${g}`);
  }

  if (emptyGlobs.length === 0 && uncovered.length === 0) {
    console.log('OK — every @source glob matches files and every UI file is covered.');
    return true;
  }

  if (emptyGlobs.length > 0) {
    console.error(`FAIL — ${emptyGlobs.length} @source glob(s) match no files (stale path?):`);
    for (const abs of emptyGlobs) {
      const raw = rawGlobs[absGlobs.indexOf(abs)] ?? abs;
      console.error(`  XX  ${raw}`);
    }
    console.error(
      '  Tailwind silently skips an empty @source glob — fix the path so its classes generate.'
    );
  }
  if (uncovered.length > 0) {
    console.error(
      `FAIL — ${uncovered.length} className-bearing UI file(s) outside every @source glob:`
    );
    for (const path of uncovered) console.error(`  XX  ${path.slice(repoRoot.length + 1)}`);
    console.error(
      '  Move it under a covered `src/` dir (as .ts/.tsx) or widen the @source globs, or its Tailwind classes will not generate.'
    );
  }
  return false;
}

/**
 * Synthetic fixtures proving the guard catches a stale (empty) glob and an
 * uncovered UI file, and passes a correct tree. Mirrors the `--self-test`
 * convention in check-bundle-map-coverage.mjs.
 *
 * @returns {boolean}
 */
function selfTest() {
  const root = '/r';
  const goodGlobs = [`${root}/pillars/**/src/**/*.{ts,tsx}`, `${root}/libs/**/src/**/*.{ts,tsx}`];
  const staleGlobs = [`${root}/apps/*/src/**/*.{ts,tsx}`, `${root}/packages/*/src/**/*.{ts,tsx}`];

  const files = [
    { path: `${root}/pillars/finance/app/src/Dashboard.tsx`, ext: '.tsx', hasClassName: true },
    { path: `${root}/pillars/shell/src/main.tsx`, ext: '.tsx', hasClassName: true },
    { path: `${root}/libs/ui/src/Button.tsx`, ext: '.tsx', hasClassName: true },
    { path: `${root}/pillars/x/app/Outside.tsx`, ext: '.tsx', hasClassName: true },
    { path: `${root}/pillars/x/app/src/Weird.jsx`, ext: '.jsx', hasClassName: true },
    { path: `${root}/libs/ui/.storybook/preview.tsx`, ext: '.tsx', hasClassName: true },
  ];

  const pillarsSrc = globToRegExp(goodGlobs[0]);
  const good = evaluateCoverage(goodGlobs, files);
  const stale = evaluateCoverage(staleGlobs, files);

  const checks = {
    'regex matches a nested app/src .tsx': pillarsSrc.test(
      `${root}/pillars/finance/app/src/Dashboard.tsx`
    ),
    'regex matches a shallow src .tsx': pillarsSrc.test(`${root}/pillars/shell/src/main.tsx`),
    'regex rejects a file outside src/': !pillarsSrc.test(`${root}/pillars/x/app/Outside.tsx`),
    'regex rejects a .jsx (wrong ext)': !pillarsSrc.test(`${root}/pillars/x/app/src/Weird.jsx`),
    'good globs are all non-empty': good.emptyGlobs.length === 0,
    'good globs flag the outside-src + .jsx files': good.uncovered.length === 2,
    'good globs exempt .storybook': !good.uncovered.some((p) => p.includes('/.storybook/')),
    'stale apps/packages globs flagged empty': stale.emptyGlobs.length === 2,
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard flags empty (stale) globs and uncovered UI files, passes a correct tree.'
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
      'Usage: node scripts/check-tailwind-source-coverage.mjs [--self-test]\n' +
        'Asserts every @source glob in libs/ui globals.css matches files and covers all UI source.'
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
