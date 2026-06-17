/**
 * Shared types for the DSL editor's issues extension (PRD-120 part C).
 *
 * `CompileEditorIssue` is the unified diagnostic shape the parent (PRD-119,
 * downstream) feeds into the editor. The parent assembles the list from:
 *   - errors returned by `food.recipes.saveDraft`'s `CompileResult`
 *     (parse / resolve / cycle errors per PRD-114 / PRD-115 / PRD-117)
 *   - rows from `recipe_version_proposed_slugs` (PRD-116) for the current
 *     `versionId`, fetched via `food.recipes.listProposedSlugs(versionId)`
 *
 * Each issue carries `severity` so the editor colours errors red and
 * proposed slugs blue. `loc` reuses PRD-114's `SourceSpan` (1-indexed
 * line/col, `endCol` exclusive) so the editor can convert it to a
 * CodeMirror offset range deterministically.
 */
import type { SourceSpan } from '@pops/food/dsl';

export type IssueSeverity = 'error' | 'info';

export interface CompileEditorIssue {
  severity: IssueSeverity;
  /** `ParseErrorCode | ResolveErrorCode | CycleErrorCode | 'ProposedSlug'`. */
  code: string;
  message: string;
  loc: SourceSpan;
  /** Set on `ProposedSlug` and on resolve errors that named a slug. */
  slug?: string;
}
