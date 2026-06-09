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
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function installMatchMedia(matches: boolean): { setMatches: (next: boolean) => void } {
  type Listener = (event: MediaQueryListEvent) => void;
  const listeners = new Set<Listener>();
  let current = matches;
  const mql = {
    get matches() {
      return current;
    },
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: (_type: 'change', cb: Listener) => listeners.add(cb),
    removeEventListener: (_type: 'change', cb: Listener) => listeners.delete(cb),
    dispatchEvent: () => true,
    addListener: (cb: Listener) => listeners.add(cb),
    removeListener: (cb: Listener) => listeners.delete(cb),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (_query: string) => mql,
  });
  return {
    setMatches: (next: boolean) => {
      current = next;
      const event = { matches: next } as MediaQueryListEvent;
      for (const cb of [...listeners]) cb(event);
    },
  };
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

describe('DslEditor — PRD-120 part D (chip widgets)', () => {
  beforeEach(() => {
    installMatchMedia(false);
  });

  const RECIPE = [
    '@recipe(slug="x", title="X")',
    '@yield(x, 1:count)',
    '@ingredient(1, banana:raw, 100:g)',
    '@ingredient(2, flour, 200:g)',
    '@step("Mash the @1 and add @cilantro for @time(20:min) at @temperature(180:c)")',
  ].join('\n');

  function chipsInDom(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.cm-dsl-chip'));
  }

  it('renders a chip widget for each @N ref inside a @step body', () => {
    render(<DslEditor initialValue={RECIPE} onChange={() => {}} />);
    const refChips = chipsInDom().filter((el) => el.getAttribute('data-chip-kind') === 'ref-index');
    expect(refChips).toHaveLength(1);
    expect(refChips[0]?.textContent).toContain('#1');
    expect(refChips[0]?.textContent).toContain('banana');
  });

  it('renders a chip for @slug refs in step bodies', () => {
    render(<DslEditor initialValue={RECIPE} onChange={() => {}} />);
    const slugChips = chipsInDom().filter((el) => el.getAttribute('data-chip-kind') === 'ref-slug');
    expect(slugChips).toHaveLength(1);
    expect(slugChips[0]?.textContent).toBe('cilantro');
  });

  it('renders @time(20:min) as a pill labeled "20 min"', () => {
    render(<DslEditor initialValue={RECIPE} onChange={() => {}} />);
    const time = chipsInDom().find((el) => el.getAttribute('data-chip-kind') === 'time');
    expect(time).toBeDefined();
    expect(time?.textContent).toBe('20 min');
  });

  it('renders @temperature(180:c) as a pill labeled "180 °C"', () => {
    render(<DslEditor initialValue={RECIPE} onChange={() => {}} />);
    const temp = chipsInDom().find((el) => el.getAttribute('data-chip-kind') === 'temperature');
    expect(temp).toBeDefined();
    expect(temp?.textContent).toBe('180 °C');
  });

  it('jumps cursor to matching @ingredient declaration on chip click', () => {
    render(<DslEditor initialValue={RECIPE} onChange={() => {}} />);
    const view = getEditorView();
    const refChip = chipsInDom().find((el) => el.getAttribute('data-chip-kind') === 'ref-index');
    expect(refChip).toBeDefined();
    const jumpFrom = refChip?.getAttribute('data-chip-jump-from');
    expect(jumpFrom).toBeTruthy();

    act(() => {
      if (refChip) fireEvent.click(refChip);
    });

    const cursor = view.state.selection.main.head;
    expect(cursor).toBe(Number.parseInt(jumpFrom ?? '0', 10));
    // The expected offset is the `@` of `@ingredient(1, ...)` — the third
    // line in the document.
    const line = view.state.doc.lineAt(cursor);
    expect(line.text.startsWith('@ingredient(1,')).toBe(true);
  });

  it('renders chips as inline labels (no widget replacement) under mobile width', () => {
    const { setMatches } = installMatchMedia(true);
    // Confirm the helper is referenced so the lint cap on unused locals
    // doesn't fire — also gives us a no-op handle for follow-on tests.
    void setMatches;
    render(<DslEditor initialValue={RECIPE} onChange={() => {}} />);
    const view = getEditorView();
    // In compact mode the chip ranges are `Decoration.mark` so the underlying
    // source characters (`@1`, `@cilantro`, `@time(20:min)`,
    // `@temperature(180:c)`) are still present in the contentDOM text. The
    // desktop variant would replace those ranges with widgets, hiding the raw
    // characters.
    const rendered = view.contentDOM.textContent ?? '';
    expect(rendered).toContain('@1');
    expect(rendered).toContain('@cilantro');
    expect(rendered).toContain('@time(20:min)');
    expect(rendered).toContain('@temperature(180:c)');
  });
});
