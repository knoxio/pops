import { describe, expect, it } from 'vitest';

import { checkUnit } from '../check-exports.mjs';

type Unit = Parameters<typeof checkUnit>[0];

const allExist = (): boolean => true;

describe('checkUnit', () => {
  it('passes a clean compiled lib (dist targets, files whitelist, package.json self-ref)', () => {
    const unit: Unit = {
      dir: 'libs/types',
      name: '@pops/types',
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
    };
    const exists = (p: string): boolean =>
      p === 'libs/types/dist/index.js' || p === 'libs/types/dist/index.d.ts';
    expect(checkUnit(unit, exists).errors).toEqual([]);
  });

  it('passes a clean pillar contract (dist/contract + openapi, files-gated)', () => {
    const unit: Unit = {
      dir: 'pillars/finance',
      name: '@pops/finance',
      pkg: {
        version: '0.1.0',
        main: './dist/contract/index.js',
        types: './dist/contract/index.d.ts',
        exports: {
          '.': { types: './dist/contract/index.d.ts', default: './dist/contract/index.js' },
          './openapi': './openapi/finance.openapi.json',
          './package.json': './package.json',
        },
        files: ['dist/contract/**', 'openapi/finance.openapi.json'],
      },
    };
    expect(checkUnit(unit, allExist).errors).toEqual([]);
  });

  it('flags an exports target that does not exist on disk', () => {
    const unit: Unit = {
      dir: 'libs/x',
      name: '@pops/x',
      pkg: {
        version: '0.1.0',
        exports: { '.': { default: './dist/gone.js' } },
        files: ['dist/**'],
      },
    };
    const errors = checkUnit(unit, () => false).errors;
    expect(errors).toContainEqual(expect.stringContaining('does not exist'));
  });

  it('flags a reachable target excluded from files (extraction firewall)', () => {
    const unit: Unit = {
      dir: 'libs/x',
      name: '@pops/x',
      pkg: {
        version: '0.1.0',
        exports: { './secret': { default: './src/secret.js' } },
        files: ['dist/**'],
      },
    };
    const errors = checkUnit(unit, allExist).errors;
    expect(errors).toContainEqual(expect.stringContaining('not covered by "files"'));
  });

  it('flags a wildcard catch-all export', () => {
    const unit: Unit = {
      dir: 'libs/wide',
      name: '@pops/wide',
      pkg: { version: '0.1.0', exports: { './*': './src/*' } },
    };
    expect(checkUnit(unit, allExist).errors).toContainEqual(
      expect.stringContaining('wildcard catch-all')
    );
  });

  it('allows the audited @pops/ui ./primitives/* wildcard', () => {
    const unit: Unit = {
      dir: 'libs/ui',
      name: '@pops/ui',
      pkg: {
        version: '0.0.1',
        main: 'src/index.ts',
        types: 'src/index.ts',
        exports: {
          '.': './src/index.ts',
          './theme/graph-colors': './src/theme/graph-colors.ts',
          './primitives/*': './src/primitives/*',
        },
      },
    };
    const errors = checkUnit(unit, allExist).errors;
    expect(errors.some((e) => e.includes('wildcard catch-all'))).toBe(false);
  });

  it('allows the audited @pops/locales ./* asset tree', () => {
    const unit: Unit = {
      dir: 'libs/locales',
      name: '@pops/locales',
      pkg: { version: '0.1.0', exports: { './*': './*' } },
    };
    const errors = checkUnit(unit, allExist).errors;
    expect(errors.some((e) => e.includes('wildcard catch-all'))).toBe(false);
  });

  it('forbids a ./* wildcard on a package not on the audited allowlist', () => {
    const unit: Unit = {
      dir: 'libs/sneaky',
      name: '@pops/sneaky',
      pkg: { version: '0.1.0', exports: { './*': './*' } },
    };
    expect(checkUnit(unit, allExist).errors).toContainEqual(
      expect.stringContaining('wildcard catch-all')
    );
  });

  it('accepts a bare-relative main on a source lib without flagging it', () => {
    const unit: Unit = {
      dir: 'libs/src-lib',
      name: '@pops/src-lib',
      pkg: { version: '0.1.0', main: 'src/index.ts', exports: { '.': './src/index.ts' } },
    };
    const exists = (p: string): boolean => p === 'libs/src-lib/src/index.ts';
    expect(checkUnit(unit, exists).errors).toEqual([]);
  });

  it('rejects a bare (non-./) target inside the exports map', () => {
    const unit: Unit = {
      dir: 'libs/bad',
      name: '@pops/bad',
      pkg: { version: '0.1.0', exports: { '.': 'dist/index.js' }, files: ['dist/**'] },
    };
    expect(checkUnit(unit, allExist).errors).toContainEqual(expect.stringContaining('is invalid'));
  });

  it('rejects a target that escapes the package root', () => {
    const unit: Unit = {
      dir: 'libs/escape',
      name: '@pops/escape',
      pkg: { version: '0.1.0', main: '../sibling/index.js' },
    };
    expect(checkUnit(unit, allExist).errors).toContainEqual(expect.stringContaining('is invalid'));
  });

  it('requires a files whitelist on a compiled unit (dist target)', () => {
    const unit: Unit = {
      dir: 'libs/compiled',
      name: '@pops/compiled',
      pkg: { version: '0.1.0', exports: { '.': { default: './dist/index.js' } } },
    };
    expect(checkUnit(unit, allExist).errors).toContainEqual(
      expect.stringContaining('extraction firewall is missing')
    );
  });

  it('does not require files on a source unit (src target)', () => {
    const unit: Unit = {
      dir: 'libs/src-only',
      name: '@pops/src-only',
      pkg: { version: '0.1.0', main: 'src/index.ts', exports: { '.': './src/index.ts' } },
    };
    const exists = (p: string): boolean => p === 'libs/src-only/src/index.ts';
    const errors = checkUnit(unit, exists).errors;
    expect(errors.some((e) => e.includes('extraction firewall'))).toBe(false);
  });

  it('rejects a non-semver version (workspace:* is not publishable)', () => {
    const unit: Unit = {
      dir: 'libs/v',
      name: '@pops/v',
      pkg: { version: 'workspace:*', exports: {} },
    };
    expect(checkUnit(unit, allExist).errors).toContainEqual(
      expect.stringContaining('publishable semver')
    );
  });

  it('accepts a real pre-release semver', () => {
    const unit: Unit = {
      dir: 'libs/v',
      name: '@pops/v',
      pkg: { version: '1.2.3-rc.1', exports: {} },
    };
    expect(checkUnit(unit, allExist).errors).toEqual([]);
  });

  it('validates every condition branch of a multi-condition export', () => {
    const unit: Unit = {
      dir: 'libs/cond',
      name: '@pops/cond',
      pkg: {
        version: '0.1.0',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js',
            require: './dist/index.cjs',
          },
        },
        files: ['dist/**'],
      },
    };
    const present = new Set(['libs/cond/dist/index.d.ts', 'libs/cond/dist/index.js']);
    const exists = (p: string): boolean => present.has(p);
    const errors = checkUnit(unit, exists).errors;
    expect(errors).toContainEqual(expect.stringContaining('index.cjs'));
    expect(errors.filter((e) => e.includes('does not exist'))).toHaveLength(1);
  });
});
