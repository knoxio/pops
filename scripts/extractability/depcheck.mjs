#!/usr/bin/env node
/**
 * EX-1 — declared-deps completeness (phantom-dependency detection).
 *
 * Asserts every package a unit IMPORTS in source is DECLARED in its own
 * package.json (dependencies / peerDependencies / optionalDependencies /
 * devDependencies). A unit that imports `@pops/types` but never declares it
 * builds fine in-workspace (pnpm hoisting) yet breaks the instant it is
 * extracted to its own repo — that is the extraction bug this gate catches.
 *
 * Usage:
 *   node scripts/extractability/depcheck.mjs <unit-dir> [<unit-dir> …]
 *   node scripts/extractability/depcheck.mjs --all
 *   node scripts/extractability/depcheck.mjs --self-test
 *
 * Exit codes: 0 = clean, 1 = phantom deps found, 2 = bad invocation / self-test fail.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  discoverUnits,
  findPhantomDeps,
  importedPackages,
  packageRoot,
  resolveUnit,
  rel,
} from './lib.mjs';

/** @param {string[]} argv */
function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const all = argv.includes('--all');
  const targets = argv.filter((a) => !a.startsWith('--'));
  if (!all && targets.length === 0) {
    process.stderr.write('usage: depcheck.mjs <unit-dir> [<unit-dir> …] | --all | --self-test\n');
    return 2;
  }

  const cwd = process.cwd();
  /** @type {import('./lib.mjs').Unit[]} */
  let units;
  try {
    units = all ? discoverUnits(undefined, cwd) : targets.map((t) => resolveUnit(t, cwd));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  let failed = 0;
  let scannedUnits = 0;
  for (const unit of units) {
    const { phantoms } = findPhantomDeps(unit);
    scannedUnits += 1;
    if (phantoms.length === 0) continue;
    failed += 1;
    process.stderr.write(`\n✗ ${unit.name} (${rel(cwd, unit.dir)}) — phantom dependencies:\n`);
    for (const phantom of phantoms) {
      const sample = phantom.files.slice(0, 3).map((f) => rel(cwd, f));
      const more =
        phantom.files.length > sample.length
          ? ` (+${phantom.files.length - sample.length} more)`
          : '';
      process.stderr.write(
        `    ${phantom.pkg}\n        imported in: ${sample.join(', ')}${more}\n`
      );
    }
  }

  if (failed > 0) {
    process.stderr.write(
      `\n${failed} unit(s) import undeclared packages. Declare them in the unit's package.json — ` +
        `an undeclared import breaks the build on extraction to its own repo.\n`
    );
    return 1;
  }
  process.stdout.write(`✔ EX-1: ${scannedUnits} unit(s) declare every imported package.\n`);
  return 0;
}

/**
 * Self-test: builds throwaway fixture units in a temp dir and asserts the
 * detector flags exactly the undeclared imports and nothing else. Exercises
 * the import-form coverage (static/dynamic/require/type-only/subpath) and the
 * package-root reduction. Returns 0 on pass, 2 on any failed assertion.
 */
function selfTest() {
  /** @type {string[]} */
  const failures = [];
  /** @param {boolean} cond @param {string} msg */
  const assert = (cond, msg) => {
    if (!cond) failures.push(msg);
  };

  // --- packageRoot unit cases (pure) ---
  const rootCases = /** @type {[string, string | null][]} */ ([
    ['@pops/types', '@pops/types'],
    ['@pops/sdk/client', '@pops/sdk'],
    ['react', 'react'],
    ['react-dom/client', 'react-dom'],
    ['./local', null],
    ['../up', null],
    ['/abs', null],
    ['node:fs', null],
    ['data:text/js,1', null],
    ['@scope', null],
    ['', null],
  ]);
  for (const [input, expected] of rootCases) {
    const got = packageRoot(input);
    assert(
      got === expected,
      `packageRoot(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(expected)}`
    );
  }

  // --- importedPackages form coverage on a temp file ---
  const root = mkdtempSync(join(tmpdir(), 'ex1-selftest-'));
  try {
    const formsFile = join(root, 'forms.ts');
    writeFileSync(
      formsFile,
      [
        "import a from 'static-default';",
        "import type { T } from 'type-only';",
        "import { b } from '@scope/named/subpath';",
        "export { c } from 're-export';",
        "const d = await import('dynamic-import');",
        "const e = require('require-call');",
        "import f from './relative-ignored';",
        "import g from 'node:fs';",
        'const noop = a + d + e + f + g; void noop; void b;',
      ].join('\n')
    );
    const forms = importedPackages(formsFile);
    for (const expected of [
      'static-default',
      'type-only',
      '@scope/named',
      're-export',
      'dynamic-import',
      'require-call',
    ]) {
      assert(
        forms.has(expected),
        `importedPackages missing ${expected} (got ${[...forms].join(',')})`
      );
    }
    assert(!forms.has('node:fs') && !forms.has('fs'), 'node: builtin leaked into importedPackages');
    assert(
      ![...forms].some((p) => p.startsWith('.')),
      'relative import leaked into importedPackages'
    );

    // --- findPhantomDeps on a fixture unit (declared vs undeclared) ---
    const unitDir = join(root, 'fixture-unit');
    mkdirSync(join(unitDir, 'src'), { recursive: true });
    writeFileSync(
      join(unitDir, 'package.json'),
      JSON.stringify({
        name: '@fixture/unit',
        dependencies: { declared: '^1.0.0' },
        devDependencies: { 'declared-dev': '^1.0.0' },
      })
    );
    writeFileSync(
      join(unitDir, 'src', 'index.ts'),
      [
        "import { x } from 'declared';",
        "import { d } from 'declared-dev';",
        "import { p } from 'phantom-pkg';",
        "import sub from 'phantom-scoped/lib';",
        "import self from '@fixture/unit/other';",
        "import fs from 'node:fs';",
        'void x; void d; void p; void sub; void self; void fs;',
      ].join('\n')
    );
    // A test file referencing an undeclared pkg must be ignored by default.
    writeFileSync(
      join(unitDir, 'src', 'index.test.ts'),
      "import t from 'test-only-phantom'; void t;"
    );

    const { phantoms } = findPhantomDeps({
      dir: unitDir,
      name: '@fixture/unit',
      pkg: {
        name: '@fixture/unit',
        dependencies: { declared: '^1.0.0' },
        devDependencies: { 'declared-dev': '^1.0.0' },
      },
    });
    const phantomNames = new Set(phantoms.map((p) => p.pkg));
    assert(phantomNames.has('phantom-pkg'), 'phantom-pkg not detected');
    assert(
      phantomNames.has('phantom-scoped'),
      'phantom-scoped (subpath reduced to root) not detected'
    );
    assert(!phantomNames.has('declared'), 'declared dep wrongly flagged');
    assert(!phantomNames.has('declared-dev'), 'declared devDep wrongly flagged');
    assert(!phantomNames.has('@fixture/unit'), 'self-import wrongly flagged');
    assert(!phantomNames.has('test-only-phantom'), 'test-file import flagged (should be excluded)');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    process.stderr.write(`✗ EX-1 self-test: ${failures.length} failure(s)\n`);
    for (const f of failures) process.stderr.write(`    - ${f}\n`);
    return 2;
  }
  process.stdout.write('✔ EX-1 self-test passed.\n');
  return 0;
}

process.exit(main(process.argv.slice(2)));
