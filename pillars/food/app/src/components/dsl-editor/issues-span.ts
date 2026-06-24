/**
 * `spanToRange` — convert a DSL `SourceSpan` (1-indexed line + column,
 * `endCol` exclusive) into a CodeMirror `{ from, to }` offset pair.
 *
 * Returns `null` when the span points outside the current document. Span
 * positions can drift out of range when the user types between two
 * compile cycles — the parent's stale issues list will outlive its
 * document — so the conversion treats out-of-range spans as "drop this
 * decoration" rather than crashing.
 *
 * Defensive clamping rules:
 *   - Lines below 1 / above `doc.lines` are rejected.
 *   - Columns are clamped to `[1, line.length + 1]` (the `+ 1` allows a
 *     span ending right after the last character on a line, which is the
 *     shape the parser emits for "missing closing paren" diagnostics).
 *   - `from > to` after clamping is rejected (zero-width spans get a
 *     one-character widening so the decoration is at least visible).
 */
import type { EditorState } from '@codemirror/state';

import type { SourceSpan } from '@pops/food/dsl';

export interface IssueRange {
  from: number;
  to: number;
}

export function spanToRange(state: EditorState, span: SourceSpan): IssueRange | null {
  const doc = state.doc;
  if (span.startLine < 1 || span.startLine > doc.lines) return null;
  if (span.endLine < 1 || span.endLine > doc.lines) return null;
  if (span.endLine < span.startLine) return null;

  const startLine = doc.line(span.startLine);
  const endLine = doc.line(span.endLine);

  const startColClamped = clampCol(span.startCol, startLine.length);
  const endColClamped = clampCol(span.endCol, endLine.length);

  const from = startLine.from + startColClamped - 1;
  let to = endLine.from + endColClamped - 1;

  if (to < from) return null;
  if (to === from) {
    to = Math.min(to + 1, doc.length);
    if (to === from) return null;
  }
  return { from, to };
}

function clampCol(col: number, lineLength: number): number {
  if (col < 1) return 1;
  // `+ 1` because `endCol` is exclusive and may point one past the last char.
  if (col > lineLength + 1) return lineLength + 1;
  return col;
}
