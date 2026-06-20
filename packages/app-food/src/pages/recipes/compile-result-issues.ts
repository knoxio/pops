import type { SourceSpan } from '@pops/food/dsl';

import type { CompileEditorIssue } from '../../components/dsl-editor/issues-types.js';
import type { RecipesSaveDraftResponses } from '../../food-api/types.gen.js';

type CompileResult = RecipesSaveDraftResponses[200]['compile'];

interface ProposedSlugRow {
  slug: string;
  fromLoc: SourceSpan;
}

const ORIGIN: SourceSpan = { startLine: 1, startCol: 1, endLine: 1, endCol: 1 };

interface PossiblyLocatedError {
  code: string;
  message: string;
  loc?: SourceSpan;
  slug?: string;
}

/**
 * Convert PRD-116's `CompileResult` + PRD-119's `listProposedSlugs` into
 * the diagnostic shape PRD-120-C's `DslEditor` consumes via its `issues`
 * prop. Errors are `severity='error'`; proposed slugs are `severity='info'`.
 *
 * `MaterialiseError` has no `loc` (it fires deep in the DB write path);
 * pin it to file-origin so the gutter marker still appears.
 */
export function buildEditorIssues(
  compile: CompileResult | null,
  proposedSlugs: readonly ProposedSlugRow[]
): CompileEditorIssue[] {
  const issues: CompileEditorIssue[] = [];
  if (compile !== null && !compile.ok) {
    for (const err of compile.errors as readonly PossiblyLocatedError[]) {
      issues.push({
        severity: 'error',
        code: err.code,
        message: err.message,
        loc: err.loc ?? ORIGIN,
        slug: typeof err.slug === 'string' ? err.slug : undefined,
      });
    }
  }
  for (const row of proposedSlugs) {
    issues.push({
      severity: 'info',
      code: 'ProposedSlug',
      message: `Proposed new slug: ${row.slug}`,
      loc: row.fromLoc,
      slug: row.slug,
    });
  }
  return issues;
}
