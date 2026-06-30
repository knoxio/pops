import { describe, expect, it } from 'vitest';

import { countHatchesInText, diffAgainstBaseline } from '../check-escape-hatches.mjs';

describe('countHatchesInText', () => {
  it('counts each cast kind on real code lines', () => {
    const text = [
      'const a = x as any;',
      'const b = y as unknown as Foo;',
      'const c = z as never;',
      'const d = list as never[];',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({
      'as any': 1,
      'as unknown as': 1,
      'as never': 2,
    });
  });

  it('does NOT count casts that only appear in comments or docstrings', () => {
    const text = [
      '// avoid `as any` here',
      ' * the `as unknown as Message` cast that would imply',
      '/* never use as never */',
      'const real = v as any;',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({ 'as any': 1 });
  });

  it('counts eslint-disable directives (which live in comments)', () => {
    const text = [
      '// eslint-disable-next-line react-hooks/exhaustive-deps',
      'doThing();',
      '/* eslint-disable no-console */',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({ 'eslint-disable': 2 });
  });

  it('returns an empty object for clean code', () => {
    expect(countHatchesInText('const a: number = 1;\nexport default a;')).toEqual({});
  });

  it('does not mistake "as never" inside an identifier or string for a cast', () => {
    // `as` must be a standalone keyword; substrings like "phase as never" are real,
    // but "classNever" / "asNever" are not — \bas never\b guards the boundary.
    expect(countHatchesInText('const asNeverRan = true;')).toEqual({});
    expect(countHatchesInText('const x = phase as never;')).toEqual({ 'as never': 1 });
  });
});

describe('diffAgainstBaseline', () => {
  const baseline = {
    'pillars/finance/app/src/a.tsx': { 'as never': 2 },
    'libs/ui/src/b.ts': { 'eslint-disable': 1 },
  };

  it('passes an unchanged tree', () => {
    expect(diffAgainstBaseline(baseline, baseline)).toEqual([]);
  });

  it('passes when hatches shrink', () => {
    const shrunk = {
      'pillars/finance/app/src/a.tsx': { 'as never': 1 },
    };
    expect(diffAgainstBaseline(shrunk, baseline)).toEqual([]);
  });

  it('flags a brand-new file carrying a hatch', () => {
    const grown = { ...baseline, 'pillars/new/c.ts': { 'as any': 1 } };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/new/c.ts',
      kind: 'as any',
      was: 0,
      now: 1,
    });
  });

  it('flags a new kind appearing in an already-baselined file', () => {
    const grown = {
      ...baseline,
      'libs/ui/src/b.ts': { 'eslint-disable': 1, 'as unknown as': 1 },
    };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'libs/ui/src/b.ts',
      kind: 'as unknown as',
      was: 0,
      now: 1,
    });
  });

  it('flags a grown count for an existing (file, kind)', () => {
    const grown = { ...baseline, 'pillars/finance/app/src/a.tsx': { 'as never': 3 } };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/finance/app/src/a.tsx',
      kind: 'as never',
      was: 2,
      now: 3,
    });
  });
});
