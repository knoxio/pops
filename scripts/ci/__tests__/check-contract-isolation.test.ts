import { describe, expect, it } from 'vitest';

import { findReachBehindInSource } from '../check-contract-isolation.mjs';

describe('findReachBehindInSource', () => {
  it('flags a deep import into another package src', () => {
    const v = findReachBehindInSource(
      "import { x } from '@pops/finance/src/db/internal.js';",
      'pillars/ai/src/x.ts'
    );
    expect(v).toEqual([
      { file: 'pillars/ai/src/x.ts', line: 1, specifier: '@pops/finance/src/db/internal.js' },
    ]);
  });

  it('flags dist and internal reach-behind', () => {
    expect(
      findReachBehindInSource("import a from '@pops/ui/dist/button.js';", 'f.ts')
    ).toHaveLength(1);
    expect(
      findReachBehindInSource("export { b } from '@pops/types/internal/secret';", 'f.ts')
    ).toHaveLength(1);
  });

  it('allows the published root and declared subpath exports', () => {
    expect(findReachBehindInSource("import a from '@pops/types';", 'f.ts')).toEqual([]);
    expect(findReachBehindInSource("import b from '@pops/types/contract';", 'f.ts')).toEqual([]);
    expect(findReachBehindInSource("import c from '@pops/ui/components';", 'f.ts')).toEqual([]);
  });

  it('ignores reach-behind-looking text in comments and non-import lines', () => {
    expect(findReachBehindInSource('// migrate off @pops/finance/src/db someday', 'f.ts')).toEqual(
      []
    );
    expect(findReachBehindInSource("const s = '@pops/finance/src/db';", 'f.ts')).toEqual([]);
  });

  it('reports the correct 1-based line number', () => {
    const src = ['const ok = 1;', '', "import { x } from '@pops/ai/src/y.js';"].join('\n');
    const v = findReachBehindInSource(src, 'f.ts');
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(3);
  });

  it('catches multiple reach-behinds across lines', () => {
    const src = [
      "import a from '@pops/ai/src/a.js';",
      "import b from '@pops/media/dist/b.js';",
    ].join('\n');
    expect(findReachBehindInSource(src, 'f.ts')).toHaveLength(2);
  });
});
