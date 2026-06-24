/**
 * Unit tests for `spanToRange` — the SourceSpan → CodeMirror offset
 * converter used by the issues extension.
 *
 * Covers the contract documented at the top of `issues-span.ts`:
 *   - 1-indexed line/column input, exclusive `endCol`
 *   - clamping out-of-range columns instead of throwing
 *   - rejecting spans whose lines fall outside the document
 *   - widening zero-width spans by one character so they remain visible
 *
 * The test mounts a real `EditorState` (no jsdom hack needed — `Text`
 * + `EditorState.create` are pure Node-land code) so we exercise the
 * exact API path the production hook drives.
 */
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { spanToRange } from '../dsl-editor/issues-span';

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc });
}

describe('spanToRange', () => {
  it('maps a single-line span to the correct offset pair', () => {
    const state = stateFor('@ingredient(1, banana:raw:foo, 1:cup)');
    // `foo` lives at columns 27–29 (1-indexed). The `:` after `raw` is at
    // column 26, so `foo` starts at 27 and ends at 30 (endCol exclusive).
    const range = spanToRange(state, { startLine: 1, startCol: 27, endLine: 1, endCol: 30 });
    expect(range).toEqual({ from: 26, to: 29 });
    expect(state.doc.sliceString(range!.from, range!.to)).toBe('foo');
  });

  it('handles multi-line spans', () => {
    const state = stateFor('line one\n@ingredient(1, banana, 1:cup)\nlast');
    // Span across the second line + into the third.
    const range = spanToRange(state, { startLine: 2, startCol: 1, endLine: 3, endCol: 5 });
    expect(range).not.toBeNull();
    expect(state.doc.sliceString(range!.from, range!.to)).toBe(
      '@ingredient(1, banana, 1:cup)\nlast'
    );
  });

  it('returns null when startLine is below 1', () => {
    expect(spanToRange(stateFor('abc'), { startLine: 0, startCol: 1, endLine: 1, endCol: 1 })).toBe(
      null
    );
  });

  it('returns null when endLine exceeds the document', () => {
    expect(spanToRange(stateFor('abc'), { startLine: 1, startCol: 1, endLine: 5, endCol: 1 })).toBe(
      null
    );
  });

  it('returns null when endLine < startLine', () => {
    expect(
      spanToRange(stateFor('abc\ndef'), { startLine: 2, startCol: 1, endLine: 1, endCol: 1 })
    ).toBe(null);
  });

  it('clamps columns beyond the line length', () => {
    const state = stateFor('abc');
    // endCol=99 should clamp to lineLength+1 = 4.
    const range = spanToRange(state, { startLine: 1, startCol: 1, endLine: 1, endCol: 99 });
    expect(range).toEqual({ from: 0, to: 3 });
  });

  it('clamps a negative column to 1', () => {
    const state = stateFor('abc');
    const range = spanToRange(state, { startLine: 1, startCol: -5, endLine: 1, endCol: 4 });
    expect(range).toEqual({ from: 0, to: 3 });
  });

  it('widens a zero-width span by one character', () => {
    const state = stateFor('abc');
    const range = spanToRange(state, { startLine: 1, startCol: 2, endLine: 1, endCol: 2 });
    expect(range).toEqual({ from: 1, to: 2 });
  });

  it('returns null when a zero-width span sits at the very end of the document', () => {
    const state = stateFor('abc');
    // `doc.length` is 3; column 4 → offset 3. Cannot widen.
    const range = spanToRange(state, { startLine: 1, startCol: 4, endLine: 1, endCol: 4 });
    expect(range).toBe(null);
  });
});
