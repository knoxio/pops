import { describe, expect, it } from 'vitest';

import { extractSpecifiers, extractSpecifiersWithLines, isTestPath } from '../import-scan.mjs';

describe('extractSpecifiers', () => {
  it('matches real import / export-from / dynamic-import / require statements', () => {
    const src = [
      "import a from '@pops/finance';",
      "export { b } from '@pops/ui/button';",
      "const c = await import('@pops/media/x');",
      "const d = require('@pops/core');",
    ].join('\n');
    expect(extractSpecifiers(src)).toEqual(
      expect.arrayContaining(['@pops/finance', '@pops/ui/button', '@pops/media/x', '@pops/core'])
    );
  });

  it('does NOT match an import keyword embedded in a string literal', () => {
    // Regression: the guards/tests carry fixture strings like the one below;
    // a line-level keyword check false-flagged them. A real import statement
    // never has its keyword preceded by a quote.
    const src = `findReachBehindInSource("import { x } from '@pops/finance/src/db/internal.js';", 'f');`;
    expect(extractSpecifiers(src)).toEqual([]);
  });

  it('does not match specifiers in comments', () => {
    expect(extractSpecifiers('// import x from "@pops/core"')).toEqual([]);
    expect(extractSpecifiers('/* see @pops/ui/dist/button */')).toEqual([]);
  });
});

describe('extractSpecifiersWithLines', () => {
  it('reports the 1-based line of the specifier', () => {
    const src = ['const x = 1;', '', "import a from '@pops/ai/src/y.js';"].join('\n');
    expect(extractSpecifiersWithLines(src)).toEqual([{ specifier: '@pops/ai/src/y.js', line: 3 }]);
  });
});

describe('isTestPath', () => {
  it('matches test/spec files and __tests__ dirs', () => {
    expect(isTestPath('libs/ui/src/__tests__/x.ts')).toBe(true);
    expect(isTestPath('pillars/ai/src/foo.test.ts')).toBe(true);
    expect(isTestPath('pillars/ai/src/foo.spec.tsx')).toBe(true);
    expect(isTestPath('scripts/ci/check-contract-isolation.mjs')).toBe(false);
    expect(isTestPath('pillars/ai/src/foo.ts')).toBe(false);
  });
});
