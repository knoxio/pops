/**
 * Shared types for the DSL editor's issues extension.
 *
 * `CompileEditorIssue` is the unified diagnostic shape the parent feeds
 * into the editor. The parent assembles the list from:
 *   - parse / resolve / cycle errors carried by the draft-save
 *     `CompileResult`
 *   - proposed-slug rows (`recipe_version_proposed_slugs`) for the current
 *     `versionId`
 *
 * Each issue carries `severity` so the editor colours errors red and
 * proposed slugs blue. `loc` reuses the DSL `SourceSpan` (1-indexed
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
