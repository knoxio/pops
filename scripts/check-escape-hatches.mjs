#!/usr/bin/env node
/**
 * Escape-hatch ratchet gate (type-safety monotonicity).
 *
 * Type-safety escape hatches — `as any`, `as unknown as`, `as never`, and
 * `eslint-disable` directives — silence the compiler/linter instead of fixing
 * the underlying issue. They are how a real defect hides in plain sight: a
 * `progress as never` once laundered a gutted DTO past the type-checker and
 * crashed the finance import wizard at runtime. The repo's operating rules
 * forbid them outright; reality is we still carry a grandfathered set from the
 * tRPC→REST migration.
 *
 * This gate makes that set a one-way ratchet, exactly like the dep-cruiser
 * known-violations baseline (EX-3): the count of hatches per (file, kind) may
 * only ever stay flat or SHRINK. A PR that adds a new hatch — or grows the
 * count in a file already carrying some — fails. Fix the type instead, or, if
 * the hatch is genuinely irreducible (a third-party generic, a ref forward),
 * regenerate the baseline with `--write` and justify it in review.
 *
 * Scope: hand-written production source under `pillars/` and `libs/`. Generated
 * API clients (`*.gen.ts`, `*-api/{core,client,sdk}/`) and test/story files are
 * excluded — generated code is not ours to fix and tests legitimately mock with
 * casts (the lint config already relaxes `no-explicit-any` there).
 *
 * `@ts-ignore` / `@ts-nocheck` are intentionally NOT ratcheted here — the
 * oxlint `ban-ts-comment` rule blocks them natively (allowing only described
 * `@ts-expect-error`), which is a cleaner hard-zero than a baseline.
 *
 * Usage:
 *   node scripts/check-escape-hatches.mjs            # check working tree vs baseline
 *   node scripts/check-escape-hatches.mjs --write    # regenerate the baseline
 *   node scripts/check-escape-hatches.mjs --self-test # prove the gate catches a new hatch
 *
 * Exit 0 = no new hatches. Exit 1 = at least one new/grown hatch. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const BASELINE_PATH = join(repoRoot, '.escape-hatch-baseline.json');
const ROOTS = ['pillars', 'libs'];
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
]);

/** Generated code we do not own — never ratcheted. */
const GENERATED_RE =
  /\.gen\.ts$|\.generated\.|[/\\][a-z-]*-api[/\\](core|client|sdk)[/\\]|api-types\./;

/** Test / story / fixture files — casts there are mocks, not production risk. */
const TEST_RE =
  /\.test\.|\.spec\.|\.stories\.|[/\\]__tests__[/\\]|[/\\]e2e[/\\]|test-utils|test-setup|\.test-d\./;

/**
 * The hatch kinds we ratchet, each a matcher over a single source line.
 * `as` casts are skipped on pure-comment lines (a docstring mentioning
 * "`as never`" is not a cast); `eslint-disable` lives in comments by nature.
 * @type {Array<{ kind: string, match: (line: string, isComment: boolean) => boolean }>}
 */
const HATCH_KINDS = [
  { kind: 'as any', match: (l, isComment) => !isComment && /\bas any\b/.test(l) },
  { kind: 'as unknown as', match: (l, isComment) => !isComment && /\bas unknown as\b/.test(l) },
  { kind: 'as never', match: (l, isComment) => !isComment && /\bas never\b/.test(l) },
  { kind: 'eslint-disable', match: (l) => /eslint-disable/.test(l) },
];

/**
 * @param {string} absDir
 * @param {(absFile: string) => void} onFile
 */
function walk(absDir, onFile) {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(abs, onFile);
    } else if (entry.isFile() && SOURCE_EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      onFile(abs);
    }
  }
}

/** @param {string} relPath */
function isScannable(relPath) {
  return !GENERATED_RE.test(relPath) && !TEST_RE.test(relPath);
}

/**
 * Count escape hatches per kind in a single file's text.
 * @param {string} text
 * @returns {Record<string, number>}
 */
export function countHatchesInText(text) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const rawLine of text.split('\n')) {
    const trimmed = rawLine.trim();
    const isComment =
      trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
    for (const { kind, match } of HATCH_KINDS) {
      if (match(rawLine, isComment)) counts[kind] = (counts[kind] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Scan the whole repo and return per-file hatch counts, keyed by repo-relative
 * POSIX path. Files with zero hatches are omitted.
 * @returns {Record<string, Record<string, number>>}
 */
export function collectHatches() {
  /** @type {Record<string, Record<string, number>>} */
  const result = {};
  for (const root of ROOTS) {
    const absRoot = join(repoRoot, root);
    if (!existsSync(absRoot)) continue;
    walk(absRoot, (abs) => {
      const rel = relative(repoRoot, abs).split('\\').join('/');
      if (!isScannable(rel)) return;
      const counts = countHatchesInText(readFileSync(abs, 'utf8'));
      if (Object.keys(counts).length > 0) result[rel] = counts;
    });
  }
  return sortDeep(result);
}

/** Stable, diff-friendly ordering for the committed baseline. */
function sortDeep(obj) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const file of Object.keys(obj).toSorted()) {
    /** @type {Record<string, number>} */
    const kinds = {};
    for (const kind of Object.keys(obj[file]).toSorted()) kinds[kind] = obj[file][kind];
    out[file] = kinds;
  }
  return out;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `✗ escape-hatch gate: baseline ${relative(repoRoot, BASELINE_PATH)} missing. ` +
        `Run \`pnpm check:escape-hatches:baseline\` to create it.`
    );
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (e) {
    console.error(`✗ escape-hatch gate: baseline is not valid JSON (${e.message})`);
    process.exit(2);
  }
}

/**
 * Compare current counts against a baseline. Returns the list of growths
 * (new files, new kinds, or higher counts). An empty list means clean.
 * @param {Record<string, Record<string, number>>} current
 * @param {Record<string, Record<string, number>>} baseline
 * @returns {Array<{ file: string, kind: string, was: number, now: number }>}
 */
export function diffAgainstBaseline(current, baseline) {
  const growths = [];
  for (const [file, kinds] of Object.entries(current)) {
    for (const [kind, now] of Object.entries(kinds)) {
      const was = baseline[file]?.[kind] ?? 0;
      if (now > was) growths.push({ file, kind, was, now });
    }
  }
  return growths;
}

function runCheck() {
  const current = collectHatches();
  const baseline = loadBaseline();
  const growths = diffAgainstBaseline(current, baseline);
  const currentTotal = total(current);
  const baselineTotal = total(baseline);

  if (growths.length > 0) {
    console.error(`✗ escape-hatch gate: ${growths.length} new type-safety escape hatch(es):\n`);
    for (const g of growths) {
      console.error(`    ${g.file} — "${g.kind}" ${g.was} → ${g.now}`);
    }
    console.error(
      `\n  These silence the compiler/linter instead of fixing the type. Fix the underlying\n` +
        `  issue. If the hatch is genuinely irreducible (third-party generic, ref forward),\n` +
        `  run \`pnpm check:escape-hatches:baseline\` and justify it in review.`
    );
    process.exit(1);
  }

  const delta = baselineTotal - currentTotal;
  const trend =
    delta > 0
      ? ` (shrank by ${delta} — run \`pnpm check:escape-hatches:baseline\` to lock in the win)`
      : ' (unchanged)';
  console.log(`✔ escape-hatch gate: ${currentTotal} hatch(es), baseline ${baselineTotal}${trend}.`);
}

/** @param {Record<string, Record<string, number>>} counts */
function total(counts) {
  let n = 0;
  for (const kinds of Object.values(counts)) for (const c of Object.values(kinds)) n += c;
  return n;
}

function runWrite() {
  const current = collectHatches();
  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    `✔ wrote ${relative(repoRoot, BASELINE_PATH)}: ${total(current)} hatch(es) across ${Object.keys(current).length} file(s).`
  );
}

/** Prove the gate actually catches a newly-introduced hatch. */
function runSelfTest() {
  const baseline = collectHatches();
  const tampered = structuredClone(baseline);
  const [firstFile] = Object.keys(tampered);
  const synthetic = 'pillars/__synthetic__/new-violation.ts';
  tampered[synthetic] = { 'as any': 1 };

  const growths = diffAgainstBaseline(tampered, baseline);
  if (!growths.some((g) => g.file === synthetic)) {
    console.error('✗ self-test: gate failed to flag a synthetic new hatch.');
    process.exit(1);
  }

  if (firstFile) {
    const grown = structuredClone(baseline);
    const [kind] = Object.keys(grown[firstFile]);
    grown[firstFile][kind] += 1;
    if (!diffAgainstBaseline(grown, baseline).some((g) => g.file === firstFile)) {
      console.error('✗ self-test: gate failed to flag a grown count in an existing file.');
      process.exit(1);
    }
  }

  if (diffAgainstBaseline(baseline, baseline).length !== 0) {
    console.error('✗ self-test: gate flagged an unchanged tree.');
    process.exit(1);
  }
  console.log('✔ self-test: gate flags new files, grown counts, and passes an unchanged tree.');
}

function main() {
  const mode = process.argv[2];
  if (mode === '--write') runWrite();
  else if (mode === '--self-test') runSelfTest();
  else if (mode === undefined) runCheck();
  else {
    console.error(`usage: check-escape-hatches.mjs [--write|--self-test]`);
    process.exit(2);
  }
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
