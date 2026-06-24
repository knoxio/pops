/**
 * Issues `StateField` + `StateEffect` for the DSL editor.
 *
 * The parent passes a fresh `CompileEditorIssue[]` whenever the
 * most-recent compile result changes. The `useDslEditorView` hook
 * dispatches `setIssuesEffect.of(issues)` and this field rebuilds the
 * decoration set + a parallel ranged-marker set used by the gutter.
 *
 * Both sets are kept in a single `StateField` so a single dispatch
 * synchronises the inline squiggles and the gutter markers — there is no
 * race where the gutter shows an issue that the squiggle has already
 * cleared.
 */
import { type EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

import { spanToRange } from './issues-span';

import type { CompileEditorIssue, IssueSeverity } from './issues-types';

export const setIssuesEffect = StateEffect.define<CompileEditorIssue[]>();

export interface IssuesState {
  issues: readonly CompileEditorIssue[];
  decorations: DecorationSet;
}

export const issuesField = StateField.define<IssuesState>({
  create(): IssuesState {
    return { issues: [], decorations: Decoration.none };
  },
  update(value, tr): IssuesState {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setIssuesEffect)) {
        const issues = effect.value;
        next = { issues, decorations: buildDecorations(tr.state, issues) };
      }
    }
    // Document changes shift offsets — rebuild against the new doc using
    // the same issue list. Issues with stale spans drop silently (see
    // `spanToRange`).
    if (tr.docChanged && next === value && value.issues.length > 0) {
      next = { issues: value.issues, decorations: buildDecorations(tr.state, value.issues) };
    }
    return next;
  },
  // `provide` feeds the field's decoration set into the editor's
  // decoration facet so the marks render without the editor wiring it
  // up explicitly. The issues array stays available via
  // `state.field(issuesField).issues` for the hover tooltip and the
  // gutter marker provider.
  provide: (field) => EditorView.decorations.from(field, (s) => s.decorations),
});

export function getIssuesForOffset(
  issues: readonly CompileEditorIssue[],
  state: EditorState,
  offset: number
): CompileEditorIssue[] {
  // `spanToRange` returns an exclusive `to` (same convention as
  // `Decoration.mark`), so the hit-test is half-open `[from, to)`. The
  // offset right after the last decorated character does NOT count.
  const hits: CompileEditorIssue[] = [];
  for (const issue of issues) {
    const range = spanToRange(state, issue.loc);
    if (!range) continue;
    if (offset >= range.from && offset < range.to) hits.push(issue);
  }
  return hits;
}

function buildDecorations(
  state: EditorState,
  issues: readonly CompileEditorIssue[]
): DecorationSet {
  const sorted = sortBySpan(state, issues);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { issue, range } of sorted) {
    builder.add(range.from, range.to, markFor(issue.severity, issue.code));
  }
  return builder.finish();
}

function sortBySpan(
  state: EditorState,
  issues: readonly CompileEditorIssue[]
): Array<{ issue: CompileEditorIssue; range: { from: number; to: number } }> {
  const out: Array<{ issue: CompileEditorIssue; range: { from: number; to: number } }> = [];
  for (const issue of issues) {
    const range = spanToRange(state, issue.loc);
    if (range) out.push({ issue, range });
  }
  out.sort((a, b) => a.range.from - b.range.from || a.range.to - b.range.to);
  return out;
}

function markFor(severity: IssueSeverity, code: string): Decoration {
  const cls =
    severity === 'error' ? 'cm-dsl-issue cm-dsl-issue--error' : 'cm-dsl-issue cm-dsl-issue--info';
  return Decoration.mark({
    class: cls,
    attributes: {
      'data-dsl-issue-severity': severity,
      'data-dsl-issue-code': code,
    },
  });
}
