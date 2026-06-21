import { describe, expect, it } from 'vitest';

import { buildEditorIssues } from '../compile-result-issues.js';

const SPAN = { startLine: 3, startCol: 1, endLine: 3, endCol: 8 };

describe('PRD-119-C — compile-result-issues', () => {
  it('returns an empty array when no compile result and no proposed slugs', () => {
    expect(buildEditorIssues(null, [])).toEqual([]);
  });

  it('skips the error list when compile.ok=true and only emits proposed-slug info issues', () => {
    const result = buildEditorIssues({ ok: true, lineCount: 3, stepCount: 2, creationCount: 1 }, [
      { slug: 'dragonfruit', fromLoc: SPAN },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: 'info',
      code: 'ProposedSlug',
      loc: SPAN,
      slug: 'dragonfruit',
    });
  });

  it('emits an error per CompileError with severity=error', () => {
    const result = buildEditorIssues(
      {
        ok: false,
        phase: 'parse',
        errors: [{ code: 'MissingRecipeHeader', message: 'no @recipe', loc: SPAN }],
      },
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: 'error',
      code: 'MissingRecipeHeader',
      loc: SPAN,
    });
  });

  it('falls back to file-origin loc for MaterialiseError (which has no loc)', () => {
    const result = buildEditorIssues(
      {
        ok: false,
        phase: 'materialise',
        errors: [{ code: 'MaterialiseError', message: 'db blew up' }],
      },
      []
    );
    expect(result[0]?.loc).toEqual({ startLine: 1, startCol: 1, endLine: 1, endCol: 1 });
  });

  it('combines errors + proposed slugs into a single array', () => {
    const result = buildEditorIssues(
      {
        ok: false,
        phase: 'resolve',
        errors: [{ code: 'UnresolvedIngredientSlug', message: 'no slug', loc: SPAN, slug: 'foo' }],
      },
      [{ slug: 'bar', fromLoc: SPAN }]
    );
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.severity)).toEqual(['error', 'info']);
  });
});
