/**
 * DslEditor — RTL smoke tests for PRD-120 part A.
 *
 * Focused on the acceptance criteria that 120-A owns: the editor mounts,
 * fires `onChange` after the debounce, swaps the document when
 * `initialValue` changes, and switches into read-only mode (banner +
 * blocked input) when `readOnly` is true.
 *
 * jsdom doesn't implement the parts of the DOM that CodeMirror leans on
 * for input events (range selection, beforeinput key handling), so the
 * "fires onChange" assertion drives the editor by dispatching a
 * synthetic transaction directly via the EditorView attached to the
 * DOM. This is the same approach @codemirror/view's own test suite uses.
 */
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DslEditor } from '../DslEditor';

/** CodeMirror exposes `EditorView.findFromDOM(node)` which walks up from
 *  any descendant until it locates the live view. We use it to drive the
 *  editor with synthetic transactions since jsdom can't pump real input
 *  events through CodeMirror's contenteditable surface. */
function getEditorView(): EditorView {
  const surface = screen.getByTestId('dsl-editor-surface');
  const cmEditor = surface.querySelector('.cm-editor');
  if (!cmEditor) throw new Error('CodeMirror .cm-editor not in DOM');
  const view = EditorView.findFromDOM(cmEditor as HTMLElement);
  if (!view) throw new Error('CodeMirror view not attached to surface');
  return view;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DslEditor — PRD-120 part A', () => {
  it('renders with the initial value populated', () => {
    render(<DslEditor initialValue='@recipe(slug="x", title="X")' onChange={() => {}} />);
    expect(screen.getByTestId('dsl-editor')).toBeInTheDocument();
    expect(getEditorView().state.doc.toString()).toBe('@recipe(slug="x", title="X")');
  });

  it('fires onChange (debounced) after the user edits the document', () => {
    vi.useFakeTimers();
    const onChange = vi.fn<(value: string) => void>();
    render(<DslEditor initialValue='@recipe(slug="x", title="X")' onChange={onChange} />);
    const view = getEditorView();

    act(() => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: '\n@yield(x, 1:count)' },
      });
    });

    // Debounce hasn't fired yet.
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(260);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('@recipe(slug="x", title="X")\n@yield(x, 1:count)');
  });

  it('coalesces rapid edits into a single debounced onChange call', () => {
    vi.useFakeTimers();
    const onChange = vi.fn<(value: string) => void>();
    render(<DslEditor initialValue="" onChange={onChange} />);
    const view = getEditorView();

    for (const ch of ['@', 'r', 'e', 'c', 'i', 'p', 'e']) {
      act(() => {
        view.dispatch({ changes: { from: view.state.doc.length, insert: ch } });
      });
      act(() => {
        vi.advanceTimersByTime(50); // shorter than the 250 ms debounce
      });
    }
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(260);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('@recipe');
  });

  it('swaps the document when initialValue changes externally', () => {
    const { rerender } = render(<DslEditor initialValue="alpha" onChange={() => {}} />);
    expect(getEditorView().state.doc.toString()).toBe('alpha');

    rerender(<DslEditor initialValue="beta" onChange={() => {}} />);
    expect(getEditorView().state.doc.toString()).toBe('beta');
  });

  it('shows the read-only banner when readOnly is true', () => {
    render(<DslEditor initialValue="x" readOnly onChange={() => {}} />);
    expect(screen.getByTestId('dsl-editor-readonly-banner')).toBeInTheDocument();
  });

  it('marks the editor non-editable when readOnly is true', () => {
    render(<DslEditor initialValue="x" readOnly onChange={() => {}} />);
    const view = getEditorView();
    // EditorView.editable.of(false) sets the contenteditable attribute,
    // which is what actually blocks keystroke input in the browser. CM's
    // readOnly state separately disables built-in mutating commands.
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false');
    expect(view.state.readOnly).toBe(true);
  });

  it('keeps the editor editable when readOnly is false', () => {
    render(<DslEditor initialValue="x" onChange={() => {}} />);
    const view = getEditorView();
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('true');
    expect(view.state.readOnly).toBe(false);
  });

  it('hides the banner when readOnly is false', () => {
    render(<DslEditor initialValue="x" onChange={() => {}} />);
    expect(screen.queryByTestId('dsl-editor-readonly-banner')).toBeNull();
  });

  it('toggles read-only at runtime without losing document state', () => {
    const { rerender } = render(
      <DslEditor initialValue="hello" onChange={() => {}} readOnly={false} />
    );
    expect(getEditorView().state.doc.toString()).toBe('hello');

    rerender(<DslEditor initialValue="hello" onChange={() => {}} readOnly />);
    expect(screen.getByTestId('dsl-editor-readonly-banner')).toBeInTheDocument();
    expect(getEditorView().state.doc.toString()).toBe('hello');

    rerender(<DslEditor initialValue="hello" onChange={() => {}} readOnly={false} />);
    expect(screen.queryByTestId('dsl-editor-readonly-banner')).toBeNull();
    expect(getEditorView().state.doc.toString()).toBe('hello');
  });
});
