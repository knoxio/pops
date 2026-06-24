/**
 * Imperative cursor-move hook for the DSL editor.
 *
 * The dispatch fires whenever the `pendingCursor` prop changes identity, so
 * callers should bump `nonce` (or supply a fresh object) when they want the
 * same coordinates re-applied.
 */
import { type MutableRefObject, useEffect } from 'react';

import type { EditorView } from '@codemirror/view';

export interface PendingCursor {
  line: number;
  col: number;
  nonce: number;
}

export function usePendingCursor(
  viewRef: MutableRefObject<EditorView | null>,
  pendingCursor: PendingCursor | undefined
): void {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (pendingCursor === undefined) return;
    const offset = lineColToOffset(view, pendingCursor.line, pendingCursor.col);
    if (offset === null) return;
    view.dispatch({ selection: { anchor: offset, head: offset }, scrollIntoView: true });
    view.focus();
  }, [pendingCursor, viewRef]);
}

function lineColToOffset(view: EditorView, line: number, col: number): number | null {
  const totalLines = view.state.doc.lines;
  if (line < 1 || line > totalLines) return null;
  const lineInfo = view.state.doc.line(line);
  const safeCol = Math.max(1, Math.min(col, lineInfo.length + 1));
  return lineInfo.from + (safeCol - 1);
}
