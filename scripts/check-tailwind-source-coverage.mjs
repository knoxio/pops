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
 * Tailwind v4 defines three `@source` forms, and this guard treats them
 * differently on purpose:
 *   - `@source "<glob>";`         a plain scan glob — checked for coverage below.
 *   - `@source inline("<pat>");`  an inline safelist pattern, not a filesystem
 *     path at all. Accepted, but excluded from the coverage checks — there is
 *     no file to find empty or uncovered.
 *   - `@source not "<glob>";`     a negated exclusion. **Banned in this repo**
 *     rather than modelled: an exclusion can de-scope a subtree Tailwind was
 *     otherwise covering, with the same silent-collapse failure mode this
 *     guard exists to catch, and this repo's globs are meant to state
 *     coverage positively and exhaustively. If a subtree needs excluding,
 *     narrow the positive globs instead of adding a negative one.
 * Any `@source` statement matching none of these three shapes is reported as
 * a violation too — a shape this guard cannot classify is exactly the kind of
 * rot it exists to catch, so it is never silently skipped.
 *
 * What it checks:
 *   1. UNRECOGNISED / BANNED STATEMENTS — every `@source` statement must be a
 *      plain glob or an `inline(...)` pattern. `@source not` and anything else
 *      this guard cannot classify fail the build with the statement quoted.
 *   2. EMPTY GLOBS — every plain `@source` glob must match at least one real
 *      file. A glob that matches nothing is the rename-rot this guard exists
 *      to catch.
 *   3. UNCOVERED SOURCE — no `className`-bearing `.tsx`/`.jsx`/`.mdx` file under
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
 * Exit 0 when every glob is non-empty, every UI file is covered, and every
 * `@source` statement is a recognised, non-banned shape; non-zero on any
 * empty glob, uncovered file, banned/unrecognised statement, failed
 * self-test, or discovery error.
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

/** Matches one whole `@source` at-rule statement, from the keyword up to (and
 * including, if present) its terminating semicolon. Deliberately unopinionated
 * about what follows `@source` — classification happens in
 * {@link parseSourceStatements} so a shape this guard cannot recognise is
 * captured, not dropped. */
const SOURCE_STATEMENT_RE = /@source\b[^;\n]*;?/g;
const PLAIN_SOURCE_RE = /^@source\s+['"]([^'"]+)['"]\s*;?$/;
const INLINE_SOURCE_RE = /^@source\s+inline\(\s*['"]([^'"]*)['"]\s*\)\s*;?$/;
const NOT_SOURCE_RE = /^@source\s+not\s+['"]([^'"]+)['"]\s*;?$/;

/**
 * @typedef {object} SourceStatement
 * @property {'source' | 'inline' | 'not' | 'unrecognized'} kind
 * @property {string} raw    The full statement text (trimmed), for reporting.
 * @property {string} [arg]  The quoted argument, when the statement has one —
 *   a filesystem glob for `source`/`not`, a safelist pattern for `inline`.
 */

/**
 * Extract and classify every `@source` statement from a globals.css source.
 * The old pattern here required a quote immediately after `@source`, which
 * matched only the plain form — `@source not "…"` and `@source inline("…")`
 * put a letter there instead and were silently dropped. This scans for the
 * `@source` keyword first, independent of what follows, so every statement is
 * captured; classification is a second pass and anything it cannot place
 * becomes `unrecognized` rather than vanishing.
 *
 * @param {string} css
 * @returns {SourceStatement[]}
 */
export function parseSourceStatements(css) {
  const statements = css.match(SOURCE_STATEMENT_RE) ?? [];
  return statements.map((raw) => {
    const trimmed = raw.trim();
    const not = trimmed.match(NOT_SOURCE_RE);
    if (not) return { kind: 'not', raw: trimmed, arg: not[1] };
    const inline = trimmed.match(INLINE_SOURCE_RE);
    if (inline) return { kind: 'inline', raw: trimmed, arg: inline[1] };
    const plain = trimmed.match(PLAIN_SOURCE_RE);
    if (plain) return { kind: 'source', raw: trimmed, arg: plain[1] };
    return { kind: 'unrecognized', raw: trimmed };
  });
}

/**
 * @typedef {object} StatementPartition
 * @property {string[]} sourceGlobs             Raw globs from plain `@source "…"` statements.
 * @property {SourceStatement[]} inlineStatements `@source inline(...)` statements — accepted, not filesystem globs.
 * @property {SourceStatement[]} violations       `@source not` (banned) and any unrecognised statement.
 */

/**
 * Split parsed `@source` statements into what `run()` needs: usable scan
 * globs, inline-safelist statements (skipped from file-coverage checks), and
 * violations. `@source not` is a violation because this repo bans it rather
 * than modelling its subtractive effect — see the file header.
 *
 * @param {SourceStatement[]} statements
 * @returns {StatementPartition}
 */
export function partitionStatements(statements) {
  /** @type {string[]} */
  const sourceGlobs = [];
  /** @type {SourceStatement[]} */
  const inlineStatements = [];
  /** @type {SourceStatement[]} */
  const violations = [];
  for (const statement of statements) {
    if (statement.kind === 'source') sourceGlobs.push(/** @type {string} */ (statement.arg));
    else if (statement.kind === 'inline') inlineStatements.push(statement);
    else violations.push(statement);
  }
  return { sourceGlobs, inlineStatements, violations };
}

/**
 * Find the index of the `]` that closes a `[...]` bracket expression starting
 * at `open` (the index of the `[`), honouring the glob rule that a `]`
 * appearing immediately after `[` — or after a `[!`/`[^` negation marker —
 * is a literal member of the class rather than the closer (`[]abc]` matches
 * `]`, `a`, `b`, or `c`). Returns -1 when no closing `]` exists in the rest
 * of the string, in which case the `[` is glob-literal, not a class opener.
 *
 * @param {string} glob
 * @param {number} open
 * @returns {number}
 */
function findBracketClassEnd(glob, open) {
  let j = open + 1;
  if (glob[j] === '!' || glob[j] === '^') j++;
  if (glob[j] === ']') j++;
  while (j < glob.length && glob[j] !== ']') j++;
  return j < glob.length ? j : -1;
}

/**
 * Compile a filesystem glob (supporting `**`, `*`, `?`, `{a,b}` brace lists,
 * and `[...]` bracket character classes — including `[a-z]` ranges and
 * `[!abc]`/`[^abc]` negation) into an anchored RegExp matched against
 * absolute POSIX-style paths.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob.charAt(i);
    if (c === '*') {
      if (glob.charAt(i + 1) === '*') {
        i++;
        if (glob.charAt(i + 1) === '/') {
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
    } else if (c === '[') {
      const end = findBracketClassEnd(glob, i);
      if (end === -1) {
        re += '\\['; // no matching `]` in the rest of the glob — literal `[`
      } else {
        let j = i + 1;
        let negate = false;
        if (glob[j] === '!' || glob[j] === '^') {
          negate = true;
          j++;
        }
        // `]` and `\` are the only characters that still need escaping for a
        // JS character class; `-` is left alone so `a-z` ranges keep working.
        const content = glob.slice(j, end).replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
        // Every class — negated or not — is spliced with a `(?!\/)` guard
        // rather than a slash folded into the class body: appending `/` to
        // the class text risks forming an unintended range (e.g. content
        // ending in `-` would make `-/` read as "hyphen through slash"), and
        // a positive class that happens to list `/` explicitly (`[/]`) would
        // otherwise match a path separator. This keeps `[...]` consistent
        // with `?` and `*`, neither of which crosses a path segment either.
        re += `(?:(?!\\/)[${negate ? '^' : ''}${content}])`;
        i = end;
      }
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
 * first metacharacter. `[` counts alongside `*`, `?`, and `{` — a bracket
 * class that opens before any other wildcard would otherwise leave its
 * literal text (e.g. `[a-z]`) in the prefix, `existsSync` would find no such
 * directory, and `walk` would silently index nothing under it — the glob
 * then reports empty regardless of what it should match.
 *
 * @param {string} absGlob
 * @returns {string}
 */
export function globBaseDir(absGlob) {
  const metaIdx = absGlob.search(/[*?{[]/);
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
 * @returns {boolean} true when every statement is recognised and non-banned,
 *   every glob is non-empty, and every UI file is covered.
 */
function run() {
  if (!existsSync(GLOBALS_CSS)) {
    console.error(`globals.css not found at ${GLOBALS_CSS}.`);
    return false;
  }
  const cssDir = dirname(GLOBALS_CSS);
  const statements = parseSourceStatements(readFileSync(GLOBALS_CSS, 'utf8'));
  if (statements.length === 0) {
    console.error(
      `No @source statements found in ${GLOBALS_CSS}. Expected explicit pillar/lib sources.`
    );
    return false;
  }
  const { sourceGlobs: rawGlobs, inlineStatements, violations } = partitionStatements(statements);
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
  for (const statement of inlineStatements) {
    console.log(`  ..    ${statement.raw}  (inline safelist pattern — not a scanned glob)`);
  }

  const ok = violations.length === 0 && emptyGlobs.length === 0 && uncovered.length === 0;

  if (violations.length > 0) {
    const banned = violations.filter((v) => v.kind === 'not');
    const unrecognized = violations.filter((v) => v.kind === 'unrecognized');
    if (banned.length > 0) {
      console.error(
        `FAIL — ${banned.length} @source not statement(s) found; this repo bans @source exclusions:`
      );
      for (const v of banned) console.error(`  XX  ${v.raw}`);
      console.error(
        '  An exclusion can silently de-scope a subtree Tailwind was covering, with no build ' +
          'error — the same failure mode this guard exists to catch. Narrow the positive ' +
          '@source globs instead of excluding from them.'
      );
    }
    if (unrecognized.length > 0) {
      console.error(
        `FAIL — ${unrecognized.length} @source statement(s) this guard does not recognise:`
      );
      for (const v of unrecognized) console.error(`  XX  ${v.raw}`);
      console.error(
        '  Supported forms: `@source "<glob>";` and `@source inline("<pattern>");`. ' +
          '`@source not` is banned in this repo (see above).'
      );
    }
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

  if (ok) {
    console.log('OK — every @source glob matches files and every UI file is covered.');
  }
  return ok;
}

/**
 * Synthetic fixtures proving the guard catches a stale (empty) glob, an
 * uncovered UI file, a banned `@source not`, and an unrecognised `@source`
 * statement — and passes a correct tree. Mirrors the `--self-test` convention
 * in check-pillar-ui-reachability.mjs.
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

  const firstGoodGlob = goodGlobs[0];
  if (firstGoodGlob === undefined) {
    throw new Error('self-test: goodGlobs fixture is empty');
  }
  const pillarsSrc = globToRegExp(firstGoodGlob);
  const good = evaluateCoverage(goodGlobs, files);
  const stale = evaluateCoverage(staleGlobs, files);

  // Bracket character classes: POPS-1788 fixed these compiling to a regex
  // that could never match (the `[`/`]` were escaped as literal text), which
  // failed safe — the empty-glob check above already caught it — but still
  // meant a bracket glob was unusable. These prove it now compiles correctly.
  const bracketClass = globToRegExp(`${root}/pillars/[a-z]*/src/index.ts`);
  const negatedClass = globToRegExp(`${root}/pillars/[!Z]*/src/index.ts`);
  const caretNegatedClass = globToRegExp(`${root}/pillars/[^Z]*/src/index.ts`);
  const rangeClass = globToRegExp(`${root}/pillars/[0-9]*/src/index.ts`);
  const segmentGuard = globToRegExp(`${root}/x/[!Z]/y`);
  const positiveSegmentGuard = globToRegExp(`${root}/x/[a/]/y`);
  const leadingBracketLiteral = globToRegExp(`${root}/[]a]bc`);
  const unterminatedBracket = globToRegExp(`${root}/[abc`);

  const goodCss = [
    `@source "${root}/pillars/**/src/**/*.{ts,tsx}";`,
    `@source "${root}/libs/**/src/**/*.{ts,tsx}";`,
  ].join('\n');
  const bannedCss = [
    `@source "${root}/pillars/**/src/**/*.{ts,tsx}";`,
    `@source not "${root}/legacy/**/*.ts";`,
  ].join('\n');
  const inlineCss = [
    `@source "${root}/pillars/**/src/**/*.{ts,tsx}";`,
    `@source inline("bg-red-{50,100,900}");`,
  ].join('\n');
  const malformedCss = [
    `@source "${root}/pillars/**/src/**/*.{ts,tsx}";`,
    `@source url("weird.css");`,
  ].join('\n');

  const goodPartition = partitionStatements(parseSourceStatements(goodCss));
  const bannedPartition = partitionStatements(parseSourceStatements(bannedCss));
  const inlinePartition = partitionStatements(parseSourceStatements(inlineCss));
  const malformedPartition = partitionStatements(parseSourceStatements(malformedCss));

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
    'plain-only css has no violations': goodPartition.violations.length === 0,
    'plain-only css yields two source globs': goodPartition.sourceGlobs.length === 2,
    '@source not is captured, not dropped': bannedPartition.violations.length === 1,
    '@source not is classified as banned (kind "not")':
      bannedPartition.violations[0]?.kind === 'not',
    '@source not does not count as a usable glob': bannedPartition.sourceGlobs.length === 1,
    '@source inline(...) is not a violation': inlinePartition.violations.length === 0,
    '@source inline(...) is tracked separately from source globs':
      inlinePartition.inlineStatements.length === 1 && inlinePartition.sourceGlobs.length === 1,
    'an unrecognised @source shape is captured, not dropped':
      malformedPartition.violations.length === 1,
    'an unrecognised @source shape is classified "unrecognized"':
      malformedPartition.violations[0]?.kind === 'unrecognized',
    '[a-z] bracket class matches a lowercase-led segment': bracketClass.test(
      `${root}/pillars/finance/src/index.ts`
    ),
    '[a-z] bracket class rejects an uppercase-led segment': !bracketClass.test(
      `${root}/pillars/Finance/src/index.ts`
    ),
    '[!Z] negation excludes the listed char': !negatedClass.test(
      `${root}/pillars/Zeta/src/index.ts`
    ),
    '[!Z] negation accepts an unlisted char': negatedClass.test(
      `${root}/pillars/finance/src/index.ts`
    ),
    '[^Z] negation behaves the same as [!Z]': !caretNegatedClass.test(
      `${root}/pillars/Zeta/src/index.ts`
    ),
    '[0-9] range matches a digit': rangeClass.test(`${root}/pillars/9food/src/index.ts`),
    '[0-9] range rejects a non-digit': !rangeClass.test(`${root}/pillars/afood/src/index.ts`),
    'a negated class never matches a path separator': !segmentGuard.test(`${root}/x//y`),
    'a negated class still matches an ordinary char': segmentGuard.test(`${root}/x/a/y`),
    'a positive class listing `/` still refuses to match a path separator':
      !positiveSegmentGuard.test(`${root}/x//y`),
    'that same positive class still matches its other listed member': positiveSegmentGuard.test(
      `${root}/x/a/y`
    ),
    'a `]` immediately after `[` is a literal class member': leadingBracketLiteral.test(
      `${root}/]bc`
    ),
    'that same class still matches its other listed member': leadingBracketLiteral.test(
      `${root}/abc`
    ),
    'an unterminated `[` falls back to a literal character': unterminatedBracket.test(
      `${root}/[abc`
    ),
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard flags empty (stale) globs, uncovered UI files, banned ' +
        '@source not, and unrecognised @source statements; passes a correct tree.'
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

if (import.meta.main) {
  main();
}
