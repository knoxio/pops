import { issuesGutter } from './issues-gutter';
import { issuesField, setIssuesEffect } from './issues-state';
import { issuesTheme } from './issues-theme';
import { issuesHoverTooltip } from './issues-tooltip';

/**
 * Public extension factory for the DSL editor's issues surface (PRD-120
 * part C).
 *
 * `issuesExtension()` bundles every CodeMirror extension the issues
 * feature needs — the `StateField` holding the diagnostic list, inline
 * decorations driven from that field, the hover-tooltip provider, the
 * diagnostic gutter, and the visual theme. Drop the result into the
 * editor's `extensions` array exactly once.
 *
 * The hook (`useDslEditorView`) drives state changes via
 * `setIssuesEffect`, exported from `issues-state` and re-exported here
 * for the hook's convenience.
 */
import type { Extension } from '@codemirror/state';

export function issuesExtension(): Extension {
  // Order matters only for visual stacking — the gutter wants to render
  // BEFORE inline decorations so multi-issue lines still highlight.
  return [issuesField, issuesGutter, issuesHoverTooltip, issuesTheme];
}

export { setIssuesEffect, issuesField };
export type { IssuesState } from './issues-state';
export type { CompileEditorIssue, IssueSeverity } from './issues-types';
