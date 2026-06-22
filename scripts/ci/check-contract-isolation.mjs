#!/usr/bin/env node
/**
 * Federation isolation guard: **no cross-contract reach-behind.**
 *
 * The contract-seam rule (docs/plans/repo-federation/00-architecture.md §2):
 * consume *across* contracts freely (a unit may import another unit's
 * published name / declared subpath exports), but **never reach behind** a
 * contract into another unit's internals. Importing another package's build
 * internals — `@pops/<pkg>/src/…`, `@pops/<pkg>/dist/…`, `@pops/<pkg>/internal…`
 * — bypasses its `exports` map and couples to internals that an extracted
 * repo would not publish. That is the unambiguous reach-behind this guard
 * catches.
 *
 * This is the **diff-scoped fast pass** (only files changed in the PR are
 * inspected) that complements the whole-tree `lint:boundaries` dep-cruiser
 * pass. It is deliberately conservative: it flags only deep imports into
 * another package's `src`/`dist`/`internal`, which can never be legitimate
 * (declared subpath exports such as `@pops/types/foo` are NOT flagged). The
 * structural cross-unit rules (ISO-R1..R4) live in dep-cruiser (P6-T01).
 *
 * Degrades gracefully: if the base ref cannot be resolved (shallow clone,
 * detached state) it inspects nothing and exits 0 rather than blocking — the
 * whole-tree pass is the backstop.
 *
 * Usage:
 *   node scripts/ci/check-contract-isolation.mjs --base origin/main
 *   node scripts/ci/check-contract-isolation.mjs --self-test
 *
 * Exit 0 = clean / nothing to inspect. Exit 1 = reach-behind found.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Extensions whose imports are inspected. */
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;

/**
 * Matches a deep import into another `@pops/*` package's build internals.
 * Group 1 = package name, group 2 = the internal segment reached.
 */
const REACH_BEHIND_RE = /['"](@pops\/[a-z0-9-]+)\/(src|dist|internal)\b[^'"]*['"]/gu;

/**
 * @typedef {object} ReachBehind
 * @property {string} file
 * @property {number} line
 * @property {string} specifier
 */

/**
 * Find reach-behind specifiers in a single source string. Exported for tests.
 *
 * @param {string} src
 * @param {string} file
 * @returns {ReachBehind[]}
 */
export function findReachBehindInSource(src, file) {
  /** @type {ReachBehind[]} */
  const out = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Cheap skip: only lines that could carry a module specifier.
    if (!line.includes('@pops/')) continue;
    if (!/\b(?:import|export|require)\b/u.test(line)) continue;
    for (const m of line.matchAll(REACH_BEHIND_RE)) {
      out.push({ file, line: i + 1, specifier: m[0].slice(1, -1) });
    }
  }
  return out;
}

/**
 * Resolve the list of changed source files vs `base`. Returns null when the
 * base ref is unavailable so the caller can no-op safely.
 *
 * @param {string} base
 * @returns {string[] | null}
 */
function changedSourceFiles(base) {
  /** @param {string[]} argv */
  const git = (argv) => execFileSync('git', argv, { cwd: repoRoot, encoding: 'utf8' });
  let mergeBase = '';
  try {
    mergeBase = git(['merge-base', base, 'HEAD']).trim();
  } catch {
    return null;
  }
  if (!mergeBase) return null;
  const diff = git(['diff', '--name-only', '--diff-filter=ACMR', mergeBase, 'HEAD']);
  return diff
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && SOURCE_EXT.test(l));
}

/**
 * @param {string} base
 * @returns {{ status: 'clean' | 'violations' | 'skipped'; violations: ReachBehind[] }}
 */
function run(base) {
  const files = changedSourceFiles(base);
  if (files === null) {
    return { status: 'skipped', violations: [] };
  }
  /** @type {ReachBehind[]} */
  const violations = [];
  for (const rel of files) {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    violations.push(...findReachBehindInSource(readFileSync(abs, 'utf8'), rel));
  }
  return { status: violations.length === 0 ? 'clean' : 'violations', violations };
}

/**
 * Self-test: prove the detector flags a reach-behind import and ignores a
 * legitimate contract import. CI runs this so a regression that neuters the
 * matcher is caught deterministically.
 *
 * @returns {boolean}
 */
function selfTest() {
  const bad = findReachBehindInSource(
    "import { x } from '@pops/finance/src/db/internal.js';",
    'fixture-bad.ts'
  );
  const dist = findReachBehindInSource(
    "import { y } from '@pops/ui/dist/button.js';",
    'fixture-dist.ts'
  );
  const goodRoot = findReachBehindInSource("import { z } from '@pops/types';", 'fixture-root.ts');
  const goodSubpath = findReachBehindInSource(
    "import { w } from '@pops/types/contract';",
    'fixture-subpath.ts'
  );
  const comment = findReachBehindInSource(
    '// see @pops/finance/src/db for the legacy layout',
    'fixture-comment.ts'
  );
  const caughtSrc = bad.length === 1;
  const caughtDist = dist.length === 1;
  const allowedRoot = goodRoot.length === 0;
  const allowedSubpath = goodSubpath.length === 0;
  const ignoredComment = comment.length === 0;
  const ok = caughtSrc && caughtDist && allowedRoot && allowedSubpath && ignoredComment;
  if (!ok) {
    console.error('SELF-TEST FAILED:');
    console.error(`  caught /src/ reach-behind:   ${caughtSrc}`);
    console.error(`  caught /dist/ reach-behind:  ${caughtDist}`);
    console.error(`  allowed bare contract:       ${allowedRoot}`);
    console.error(`  allowed subpath export:      ${allowedSubpath}`);
    console.error(`  ignored comment:             ${ignoredComment}`);
  } else {
    console.log('self-test OK — flags /src|dist|internal/ reach-behind, allows contract imports.');
  }
  return ok;
}

function parseBase(argv) {
  const i = argv.indexOf('--base');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/ci/check-contract-isolation.mjs [--base <ref>] [--self-test]');
    process.exit(2);
  }
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const base = parseBase(argv);
  const { status, violations } = run(base);
  if (status === 'skipped') {
    console.log(
      `Base ref "${base}" unavailable — skipping diff-scoped check (whole-tree pass is the backstop).`
    );
    process.exit(0);
  }
  if (status === 'clean') {
    console.log(`OK — no cross-contract reach-behind in the diff vs ${base}.`);
    process.exit(0);
  }
  console.error(`FAIL — ${violations.length} cross-contract reach-behind import(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.specifier}`);
  }
  console.error(
    '\nImport another unit only through its published name or declared subpath ' +
      'exports — never its src/dist/internal (00-architecture.md §2).'
  );
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
