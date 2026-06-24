/**
 * Diagnostic gutter for the issues extension.
 *
 * Renders a single marker per line that contains at least one issue.
 * Error wins over info when both exist on the same line (so the user
 * always sees the strongest signal). The marker carries a stable
 * `data-testid` so RTL tests can assert without sampling pixel styles.
 */
import { gutter, GutterMarker } from '@codemirror/view';

import { spanToRange } from './issues-span';
import { issuesField } from './issues-state';

import type { IssueSeverity } from './issues-types';

class IssueMarker extends GutterMarker {
  constructor(
    private readonly severity: IssueSeverity,
    private readonly count: number
  ) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return (
      other instanceof IssueMarker && other.severity === this.severity && other.count === this.count
    );
  }

  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = `cm-dsl-issue-gutter cm-dsl-issue-gutter--${this.severity}`;
    el.setAttribute('data-testid', 'dsl-editor-issue-gutter');
    el.setAttribute('data-dsl-issue-severity', this.severity);
    el.setAttribute('data-dsl-issue-count', String(this.count));
    el.textContent = this.severity === 'error' ? '●' : '○';
    return el;
  }
}

export const issuesGutter = gutter({
  class: 'cm-dsl-issue-gutter-column',
  lineMarker(view, line) {
    const field = view.state.field(issuesField, false);
    if (!field || field.issues.length === 0) return null;
    let hasError = false;
    let count = 0;
    for (const issue of field.issues) {
      const range = spanToRange(view.state, issue.loc);
      if (!range) continue;
      // The marker sits in the gutter of the line whose start offset is
      // closest to the issue range — we use the line containing the
      // span's `from` (matches users' intuition for multi-line spans).
      if (range.from >= line.from && range.from <= line.to) {
        count += 1;
        if (issue.severity === 'error') hasError = true;
      }
    }
    if (count === 0) return null;
    return new IssueMarker(hasError ? 'error' : 'info', count);
  },
  lineMarkerChange(update) {
    const before = update.startState.field(issuesField, false);
    const after = update.state.field(issuesField, false);
    return before !== after;
  },
});
