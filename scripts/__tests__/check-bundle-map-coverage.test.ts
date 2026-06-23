import { describe, expect, it } from 'vitest';

import { evaluateCoverage, referencedAppPackages } from '../check-bundle-map-coverage.mjs';

type PillarApp = Parameters<typeof evaluateCoverage>[0][number];

const app = (pkgName: string): PillarApp => ({
  pkgName,
  pkgPath: `pillars/${pkgName.replace('@pops/app-', '')}/app/package.json`,
});

describe('referencedAppPackages', () => {
  it('extracts every @pops/app-* specifier from real import statements', () => {
    const src = [
      "import { manifest as a } from '@pops/app-alpha';",
      "import { x, manifest as b } from '@pops/app-beta';",
      "import { manifest as e } from '@pops/overlay-ego';",
      "import type { Foo } from '@pops/types';",
    ].join('\n');
    expect(referencedAppPackages(src)).toEqual(new Set(['@pops/app-alpha', '@pops/app-beta']));
  });

  it('ignores a specifier that only appears in a line comment', () => {
    const src = "// import { manifest } from '@pops/app-ghost';";
    expect(referencedAppPackages(src).has('@pops/app-ghost')).toBe(false);
  });

  it('ignores a specifier that only appears in a block comment', () => {
    const src = "/* see @pops/app-ghost — import { m } from '@pops/app-ghost' */";
    expect(referencedAppPackages(src).has('@pops/app-ghost')).toBe(false);
  });

  it('ignores a package name that only appears inside a string literal', () => {
    const src = "const doc = 'the @pops/app-ghost pillar is documented elsewhere';";
    expect(referencedAppPackages(src).has('@pops/app-ghost')).toBe(false);
  });

  it('counts a dynamic import() specifier', () => {
    const src = "const m = await import('@pops/app-lazy');";
    expect(referencedAppPackages(src).has('@pops/app-lazy')).toBe(true);
  });

  it('excludes non-app @pops packages (overlay-ego, types, ui)', () => {
    const src = [
      "import { manifest } from '@pops/overlay-ego';",
      "import type { ModuleManifest } from '@pops/types';",
      "import { Button } from '@pops/ui';",
    ].join('\n');
    expect(referencedAppPackages(src).size).toBe(0);
  });
});

describe('evaluateCoverage', () => {
  it('passes when every discovered app is referenced', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const referenced = new Set(['@pops/app-alpha', '@pops/app-beta']);
    const result = evaluateCoverage(apps, referenced);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual(['@pops/app-alpha', '@pops/app-beta']);
  });

  it('reports the exact app missing from the bundle map', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const referenced = new Set(['@pops/app-alpha']);
    const result = evaluateCoverage(apps, referenced);
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.covered).toEqual(['@pops/app-alpha']);
  });

  it('reports multiple missing apps', () => {
    const apps = [app('@pops/app-a'), app('@pops/app-b'), app('@pops/app-c')];
    const result = evaluateCoverage(apps, new Set(['@pops/app-b']));
    expect(result.missing).toEqual(['@pops/app-a', '@pops/app-c']);
  });

  it('does not let an extra bundle-map reference mask a real gap', () => {
    const apps = [app('@pops/app-alpha')];
    const referenced = new Set(['@pops/app-alpha', '@pops/app-extra']);
    const result = evaluateCoverage(apps, referenced);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual(['@pops/app-alpha']);
  });

  it('flags everything missing when the bundle map references nothing', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const result = evaluateCoverage(apps, new Set());
    expect(result.missing).toEqual(['@pops/app-alpha', '@pops/app-beta']);
    expect(result.covered).toEqual([]);
  });
});
