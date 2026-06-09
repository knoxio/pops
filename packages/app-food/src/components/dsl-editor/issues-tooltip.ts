/**
 * Hover tooltip provider for the issues extension (PRD-120 part C).
 *
 * On hover, looks up every `CompileEditorIssue` whose `loc` covers the
 * pointer offset and renders them stacked in a single tooltip. Multiple
 * issues at the same offset (e.g. a `ProposedSlug` + an `UnresolvedSlug`
 * pointing at the same descriptor) all show.
 *
 * The DOM shape is exposed via `data-testid` and stable class names so
 * the RTL suite can assert on the tooltip without exercising real
 * pointer events through jsdom (which doesn't reliably trigger
 * CodeMirror's hover hit-testing). Tests call the provider function
 * directly instead.
 */
import { hoverTooltip, type Tooltip } from '@codemirror/view';

import { getIssuesForOffset, issuesField } from './issues-state';

import type { CompileEditorIssue } from './issues-types';

export const issuesHoverTooltip = hoverTooltip((view, pos): Tooltip | null => {
  const field = view.state.field(issuesField, false);
  if (!field || field.issues.length === 0) return null;
  const hits = getIssuesForOffset(field.issues, view.state, pos);
  if (hits.length === 0) return null;
  return {
    pos,
    end: pos,
    above: true,
    create: () => ({ dom: renderTooltipDom(hits) }),
  };
});

export function renderTooltipDom(issues: readonly CompileEditorIssue[]): HTMLDivElement {
  const dom = document.createElement('div');
  dom.className = 'cm-dsl-issue-tooltip';
  dom.setAttribute('data-testid', 'dsl-editor-issue-tooltip');
  for (const issue of issues) dom.appendChild(renderIssueLine(issue));
  return dom;
}

function renderIssueLine(issue: CompileEditorIssue): HTMLDivElement {
  const row = document.createElement('div');
  row.className = `cm-dsl-issue-tooltip__row cm-dsl-issue-tooltip__row--${issue.severity}`;
  row.setAttribute('data-dsl-issue-severity', issue.severity);
  row.setAttribute('data-dsl-issue-code', issue.code);

  const codeSpan = document.createElement('span');
  codeSpan.className = 'cm-dsl-issue-tooltip__code';
  codeSpan.textContent = issue.code;
  row.appendChild(codeSpan);

  const messageSpan = document.createElement('span');
  messageSpan.className = 'cm-dsl-issue-tooltip__message';
  messageSpan.textContent = issue.message;
  row.appendChild(messageSpan);

  if (issue.slug !== undefined) {
    const slugSpan = document.createElement('span');
    slugSpan.className = 'cm-dsl-issue-tooltip__slug';
    slugSpan.textContent = issue.slug;
    row.appendChild(slugSpan);
  }
  return row;
}
