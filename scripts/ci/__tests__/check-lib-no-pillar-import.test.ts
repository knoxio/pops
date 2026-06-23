import { describe, expect, it } from 'vitest';

import { extractSpecifiers, findViolations } from '../check-lib-no-pillar-import.mjs';

type Unit = Parameters<typeof findViolations>[0][number];

const pillar = (name: string, dir = `pillars/${name.replace('@pops/', '')}`): Unit => ({
  dir,
  name,
  kind: 'pillar',
  pkg: {},
});

const lib = (name: string, pkg: Record<string, unknown>): Unit => ({
  dir: `libs/${name.replace('@pops/', '')}`,
  name,
  kind: 'lib',
  pkg,
});

describe('extractSpecifiers', () => {
  it('matches every real import/export/require form', () => {
    const src = [
      "import a from '@pops/finance';",
      "import { b } from '@pops/ui/button';",
      "import type { T } from '@pops/types';",
      "export { c } from '@pops/navigation';",
      "const d = await import('@pops/media/x');",
      "const e = require('@pops/core');",
    ].join('\n');
    expect(extractSpecifiers(src)).toEqual(
      expect.arrayContaining([
        '@pops/finance',
        '@pops/ui/button',
        '@pops/types',
        '@pops/navigation',
        '@pops/media/x',
        '@pops/core',
      ])
    );
  });

  it('does not match specifiers that only appear in comments or unrelated strings', () => {
    const src = [
      '// see @pops/finance for the contract',
      "const label = 'package: @pops/core';",
      '/* @pops/media is a pillar */',
    ].join('\n');
    expect(extractSpecifiers(src)).toEqual([]);
  });
});

describe('findViolations', () => {
  const units: Unit[] = [pillar('@pops/finance'), pillar('@pops/app-media', 'pillars/media/app')];

  it('flags a pillar in dependencies (hard)', () => {
    const all = [...units, lib('@pops/evil', { dependencies: { '@pops/finance': 'workspace:*' } })];
    const v = findViolations(all, () => [], {});
    expect(v).toContainEqual({ lib: '@pops/evil', pillar: '@pops/finance', via: 'dependencies' });
  });

  it('flags a pillar in peerDependencies (hard)', () => {
    const all = [...units, lib('@pops/peer', { peerDependencies: { '@pops/finance': '*' } })];
    const v = findViolations(all, () => [], {});
    expect(v).toContainEqual({
      lib: '@pops/peer',
      pillar: '@pops/finance',
      via: 'peerDependencies',
    });
  });

  it('flags a pillar in devDependencies unless allowlisted', () => {
    const all = [...units, lib('@pops/dev', { devDependencies: { '@pops/finance': '*' } })];
    expect(findViolations(all, () => [], {})).toContainEqual({
      lib: '@pops/dev',
      pillar: '@pops/finance',
      via: 'devDependencies',
    });
    const allowed = { '@pops/dev': new Set(['@pops/finance']) };
    expect(findViolations(all, () => [], allowed)).toEqual([]);
  });

  it('flags a frontend pillar import in source (app-* counts as a pillar)', () => {
    const all = [...units, lib('@pops/uses-fe', {})];
    const v = findViolations(
      all,
      (u) => (u.name === '@pops/uses-fe' ? ["import { X } from '@pops/app-media/widget';"] : []),
      {}
    );
    expect(v).toContainEqual({
      lib: '@pops/uses-fe',
      pillar: '@pops/app-media',
      via: 'import @pops/app-media/widget',
    });
  });

  it('passes a clean lib (lib→lib dep, no pillar reach)', () => {
    const all = [
      ...units,
      lib('@pops/clean', { dependencies: { '@pops/types': 'workspace:*' } }),
      lib('@pops/types', {}),
    ];
    expect(findViolations(all, () => [], {})).toEqual([]);
  });

  it('flags @pops/ui if storybook app-* are ever (re)added as a workspace devDep', () => {
    // The storybook fold (P2-T04) consumes app-* via Vite source aliases in
    // .storybook/main.ts, NOT via package.json devDeps — there is intentionally
    // no `@pops/ui` allowlist entry. A naive re-add would both trip the guard
    // and form a `tsc -b` project-reference cycle (every app-* depends on @pops/ui).
    const all = [
      pillar('@pops/app-food', 'pillars/food/app'),
      lib('@pops/ui', { devDependencies: { '@pops/app-food': 'workspace:*' } }),
    ];
    expect(findViolations(all, () => [])).toContainEqual({
      lib: '@pops/ui',
      pillar: '@pops/app-food',
      via: 'devDependencies',
    });
  });

  it('does not scan pillars themselves (a pillar may depend on a pillar)', () => {
    const all = [
      pillar('@pops/finance'),
      {
        dir: 'pillars/shell',
        name: '@pops/shell',
        kind: 'pillar',
        pkg: { dependencies: { '@pops/finance': '*' } },
      } satisfies Unit,
    ];
    expect(findViolations(all, () => [], {})).toEqual([]);
  });
});
