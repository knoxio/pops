import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import {
  packageRoot,
  importedPackages,
  declaredDependencies,
  findPhantomDeps,
  discoverUnits,
  resolveUnit,
  tsconfigAliasMatcher,
} from '../lib.mjs';

describe('packageRoot', () => {
  it('reduces scoped and unscoped specifiers to their installable root', () => {
    expect(packageRoot('@pops/types')).toBe('@pops/types');
    expect(packageRoot('@pops/sdk/client')).toBe('@pops/sdk');
    expect(packageRoot('react')).toBe('react');
    expect(packageRoot('react-dom/client')).toBe('react-dom');
  });

  it('returns null for non-package specifiers', () => {
    for (const s of [
      './local',
      '../up',
      '/abs',
      'node:fs',
      'data:text/js,1',
      'file:x',
      '@scope',
      '',
    ]) {
      expect(packageRoot(s)).toBeNull();
    }
  });
});

describe('importedPackages — AST coverage of every import form', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ex1-imp-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('captures static, type-only, re-export, dynamic, require and import-equals', () => {
    const file = join(dir, 'forms.ts');
    writeFileSync(
      file,
      [
        "import a from 'static-default';",
        "import type { T } from 'type-only';",
        "import { b } from '@scope/named/subpath';",
        "export { c } from 're-export';",
        "export * from 'star-export';",
        "const d = await import('dynamic-import');",
        "const e = require('require-call');",
        "import legacy = require('import-equals');",
        'void [a, b, d, e, legacy];',
      ].join('\n')
    );
    const got = importedPackages(file);
    expect(got).toEqual(
      new Set([
        'static-default',
        'type-only',
        '@scope/named',
        're-export',
        'star-export',
        'dynamic-import',
        'require-call',
        'import-equals',
      ])
    );
  });

  it('ignores relative imports and node builtins', () => {
    const file = join(dir, 'ignored.ts');
    writeFileSync(file, "import './x'; import 'node:fs'; import '../y';");
    expect(importedPackages(file).size).toBe(0);
  });

  it('does not treat an import inside a string literal as an import', () => {
    const file = join(dir, 'string-literal.ts');
    writeFileSync(file, `const code = "import x from '@pops/finance';"; void code;`);
    expect(importedPackages(file).has('@pops/finance')).toBe(false);
  });
});

describe('declaredDependencies', () => {
  it('unions deps, peerDeps, optionalDeps and devDeps', () => {
    const declared = declaredDependencies({
      dependencies: { a: '1' },
      peerDependencies: { b: '1' },
      optionalDependencies: { c: '1' },
      devDependencies: { d: '1' },
    });
    expect([...declared].toSorted()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('findPhantomDeps — fixture units', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ex1-unit-'));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function makeUnit(name: string, pkg: Record<string, unknown>, files: Record<string, string>) {
    const dir = join(root, name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...pkg }));
    for (const [rel, content] of Object.entries(files)) {
      const target = join(dir, rel);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, content);
    }
    return resolveUnit(dir);
  }

  it('flags an undeclared import and ignores declared/self/builtin/test imports', () => {
    const unit = makeUnit(
      'flagged',
      {
        dependencies: { declared: '^1.0.0' },
        devDependencies: { 'declared-dev': '^1.0.0' },
      },
      {
        'src/index.ts': [
          "import 'declared';",
          "import 'declared-dev';",
          "import 'phantom-pkg';",
          "import 'phantom-scoped/lib';",
          "import 'flagged/other';",
          "import 'node:fs';",
        ].join('\n'),
        'src/index.test.ts': "import 'test-only-phantom';",
      }
    );
    const { phantoms } = findPhantomDeps(unit);
    const names = phantoms.map((p) => p.pkg);
    expect(names).toContain('phantom-pkg');
    expect(names).toContain('phantom-scoped');
    expect(names).not.toContain('declared');
    expect(names).not.toContain('declared-dev');
    expect(names).not.toContain('flagged');
    expect(names).not.toContain('test-only-phantom');
  });

  it('returns no phantoms when everything is declared', () => {
    const unit = makeUnit(
      'clean',
      { dependencies: { ok: '^1.0.0', '@scope/ok': '^1.0.0' } },
      { 'src/index.ts': "import 'ok'; import '@scope/ok/sub';" }
    );
    expect(findPhantomDeps(unit).phantoms).toHaveLength(0);
  });

  it('treats a unit with no source as having nothing to check', () => {
    const dir = join(root, 'empty');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'empty' }));
    const unit = resolveUnit(dir);
    expect(findPhantomDeps(unit).phantoms).toHaveLength(0);
  });

  it('does NOT flag tsconfig path-alias imports (they resolve to the unit itself)', () => {
    const dir = join(root, 'aliased');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'aliased' }));
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })
    );
    writeFileSync(
      join(dir, 'src', 'index.ts'),
      "import { s } from '@/store'; import '@/lib/x'; void s;"
    );
    const matcher = tsconfigAliasMatcher(dir);
    expect(matcher('@/store')).toBe(true);
    expect(matcher('@/lib')).toBe(true);
    expect(matcher('@pops/types')).toBe(false);
    expect(findPhantomDeps(resolveUnit(dir)).phantoms).toHaveLength(0);
  });
});

describe('discoverUnits — against the live repo', () => {
  it('finds the leaf libs and skips Rust-only crates', () => {
    const units = discoverUnits();
    const names = new Set(units.map((u) => u.name));
    expect(names.has('@pops/types')).toBe(true);
    expect(names.has('@pops/db-types')).toBe(true);
    // contacts is a Rust crate (no package.json) — never discovered here.
    expect([...names].every((n) => typeof n === 'string')).toBe(true);
  });

  it('every discovered unit declares every package it imports (EX-1 holds on the tree)', () => {
    const offenders = discoverUnits()
      .map((u) => ({ name: u.name, phantoms: findPhantomDeps(u).phantoms }))
      .filter((r) => r.phantoms.length > 0);
    expect(offenders).toEqual([]);
  });
});
