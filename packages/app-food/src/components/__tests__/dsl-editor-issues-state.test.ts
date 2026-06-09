/**
 * Unit tests for the issues `StateField` + `setIssuesEffect` — PRD-120
 * part C.
 *
 * Drives the state field through an `EditorState` directly so we cover:
 *   - dispatching `setIssuesEffect` populates decorations
 *   - subsequent dispatches REPLACE the prior set (not append)
 *   - an empty issues array clears every decoration
 *   - document changes rebuild decorations against the new offsets
 *   - `getIssuesForOffset` returns every issue whose span covers a hit
 */
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { getIssuesForOffset, issuesField, setIssuesEffect } from '../dsl-editor/issues-state';

import type { CompileEditorIssue } from '../dsl-editor/issues-types';

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [issuesField] });
}

function decorationCount(state: EditorState): number {
  const set = state.field(issuesField).decorations;
  let count = 0;
  const iter = set.iter();
  while (iter.value !== null) {
    count += 1;
    iter.next();
  }
  return count;
}

const ISSUE_A: CompileEditorIssue = {
  severity: 'error',
  code: 'UnresolvedSlug',
  message: 'Unknown slug',
  loc: { startLine: 1, startCol: 1, endLine: 1, endCol: 5 },
  slug: 'foo',
};

const ISSUE_B: CompileEditorIssue = {
  severity: 'info',
  code: 'ProposedSlug',
  message: 'Proposed: banana',
  loc: { startLine: 1, startCol: 10, endLine: 1, endCol: 16 },
  slug: 'banana',
};

describe('issues StateField — PRD-120 part C', () => {
  it('starts with no decorations', () => {
    const state = stateFor('hello world');
    expect(decorationCount(state)).toBe(0);
    expect(state.field(issuesField).issues).toEqual([]);
  });

  it('applies decorations on setIssuesEffect dispatch', () => {
    let state = stateFor('hello world');
    state = state.update({ effects: setIssuesEffect.of([ISSUE_A, ISSUE_B]) }).state;
    expect(decorationCount(state)).toBe(2);
    expect(state.field(issuesField).issues).toEqual([ISSUE_A, ISSUE_B]);
  });

  it('replaces (not appends) on subsequent dispatches', () => {
    let state = stateFor('hello world');
    state = state.update({ effects: setIssuesEffect.of([ISSUE_A]) }).state;
    expect(decorationCount(state)).toBe(1);
    state = state.update({ effects: setIssuesEffect.of([ISSUE_B]) }).state;
    expect(decorationCount(state)).toBe(1);
    expect(state.field(issuesField).issues).toEqual([ISSUE_B]);
  });

  it('clears all decorations when an empty array is dispatched', () => {
    let state = stateFor('hello world');
    state = state.update({ effects: setIssuesEffect.of([ISSUE_A, ISSUE_B]) }).state;
    expect(decorationCount(state)).toBe(2);
    state = state.update({ effects: setIssuesEffect.of([]) }).state;
    expect(decorationCount(state)).toBe(0);
    expect(state.field(issuesField).issues).toEqual([]);
  });

  it('drops decorations whose span no longer fits the document', () => {
    let state = stateFor('hello world');
    const offDoc: CompileEditorIssue = {
      severity: 'error',
      code: 'UnresolvedSlug',
      message: 'gone',
      loc: { startLine: 5, startCol: 1, endLine: 5, endCol: 4 },
    };
    state = state.update({ effects: setIssuesEffect.of([ISSUE_A, offDoc]) }).state;
    expect(decorationCount(state)).toBe(1);
    expect(state.field(issuesField).issues).toHaveLength(2);
  });

  it('rebuilds decorations against new offsets on document change', () => {
    let state = stateFor('hello world');
    state = state.update({ effects: setIssuesEffect.of([ISSUE_A]) }).state;
    const decorationsBefore = state.field(issuesField).decorations;
    state = state.update({ changes: { from: 0, to: 0, insert: 'XX' } }).state;
    const decorationsAfter = state.field(issuesField).decorations;
    expect(decorationsAfter).not.toBe(decorationsBefore);
    // The issue's span still says cols 1..5; after rebuild the decoration
    // covers `XXhe` (the new offsets 0..4).
    const iter = decorationsAfter.iter();
    expect(iter.from).toBe(0);
    expect(iter.to).toBe(4);
  });

  it('attaches severity + code to the decoration mark via data attributes', () => {
    let state = stateFor('hello world');
    state = state.update({ effects: setIssuesEffect.of([ISSUE_A, ISSUE_B]) }).state;
    const set = state.field(issuesField).decorations;
    const iter = set.iter();
    const severities: string[] = [];
    while (iter.value !== null) {
      const attrs = (iter.value.spec as { attributes?: Record<string, string> }).attributes;
      severities.push(attrs?.['data-dsl-issue-severity'] ?? '');
      iter.next();
    }
    expect(severities).toEqual(['error', 'info']);
  });
});

describe('getIssuesForOffset — PRD-120 part C', () => {
  it('returns issues whose span covers the offset', () => {
    const state = stateFor('hello world');
    // ISSUE_A covers cols 1..5 → offsets [0, 4) (half-open, like
    // `Decoration.mark`'s `to`).
    const hits = getIssuesForOffset([ISSUE_A, ISSUE_B], state, 2);
    expect(hits).toEqual([ISSUE_A]);
  });

  it('returns multiple issues when spans overlap on the offset', () => {
    const state = stateFor('hello world');
    const overlapping: CompileEditorIssue = {
      ...ISSUE_B,
      loc: { startLine: 1, startCol: 1, endLine: 1, endCol: 6 },
    };
    const hits = getIssuesForOffset([ISSUE_A, overlapping], state, 2);
    expect(hits).toEqual([ISSUE_A, overlapping]);
  });

  it('skips issues whose span is out of range', () => {
    const state = stateFor('hello');
    const offDoc: CompileEditorIssue = {
      ...ISSUE_A,
      loc: { startLine: 5, startCol: 1, endLine: 5, endCol: 4 },
    };
    expect(getIssuesForOffset([offDoc], state, 0)).toEqual([]);
  });

  it('treats the span end as exclusive', () => {
    // Mirrors `Decoration.mark`'s `to`-is-exclusive contract — the
    // character right after the squiggle should NOT surface the
    // tooltip on hover.
    const state = stateFor('hello world');
    // ISSUE_A covers cols 1..5 → offsets [0, 4). Offset 4 is the first
    // character NOT in the squiggle.
    expect(getIssuesForOffset([ISSUE_A], state, 3)).toEqual([ISSUE_A]);
    expect(getIssuesForOffset([ISSUE_A], state, 4)).toEqual([]);
  });
});
