/**
 * Inline styles for the issues extension.
 *
 * `EditorView.theme` keeps the rules scoped to a generated class so the
 * extension is self-contained — the editor pages don't need to import a
 * separate stylesheet.
 *
 * Errors use a red wavy underline (the de-facto IDE convention) and a
 * solid red gutter dot. Info issues (proposed slugs, resolver hints) use
 * a blue dotted underline + a hollow blue dot. Colours read against both
 * the default CodeMirror light theme and the `@pops/ui` dark variants
 * shell pages mount; the test suite asserts the DOM attributes, not the
 * pixel colours, so theme tuning stays a CSS-only follow-up.
 */
import { EditorView } from '@codemirror/view';

export const issuesTheme = EditorView.theme({
  '.cm-dsl-issue': {
    textDecoration: 'underline',
    textDecorationSkipInk: 'none',
  },
  '.cm-dsl-issue--error': {
    textDecorationStyle: 'wavy',
    textDecorationColor: '#dc2626',
    textDecorationThickness: '1px',
  },
  '.cm-dsl-issue--info': {
    textDecorationStyle: 'dotted',
    textDecorationColor: '#2563eb',
    textDecorationThickness: '1px',
  },
  '.cm-dsl-issue-gutter-column': {
    width: '1rem',
    textAlign: 'center',
  },
  '.cm-dsl-issue-gutter': {
    display: 'inline-block',
    fontSize: '0.75rem',
    lineHeight: '1.2',
  },
  '.cm-dsl-issue-gutter--error': { color: '#dc2626' },
  '.cm-dsl-issue-gutter--info': { color: '#2563eb' },
  '.cm-dsl-issue-tooltip': {
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    lineHeight: '1.4',
    maxWidth: '24rem',
    backgroundColor: '#1f2937',
    color: '#f9fafb',
    borderRadius: '0.25rem',
    boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
  },
  '.cm-dsl-issue-tooltip__row': {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    paddingBottom: '0.25rem',
  },
  '.cm-dsl-issue-tooltip__row:last-child': { paddingBottom: '0' },
  '.cm-dsl-issue-tooltip__code': {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    opacity: '0.7',
  },
  '.cm-dsl-issue-tooltip__row--error .cm-dsl-issue-tooltip__code': { color: '#fca5a5' },
  '.cm-dsl-issue-tooltip__row--info .cm-dsl-issue-tooltip__code': { color: '#93c5fd' },
  '.cm-dsl-issue-tooltip__message': { color: '#f9fafb' },
  '.cm-dsl-issue-tooltip__slug': {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    opacity: '0.85',
  },
});
