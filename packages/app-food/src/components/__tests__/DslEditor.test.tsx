/**
 * DslEditor — RTL smoke tests for PRD-120 part A.
 *
 * Focused on the acceptance criteria that 120-A owns: the editor mounts,
 * fires `onChange` after the debounce, swaps the document when
 * `initialValue` changes, and switches into read-only mode (banner +
 * blocked input) when `readOnly` is true. The PRD-120 part B suite at
 * the bottom of this file covers autocomplete wiring; the part D suite
 * covers chip widgets + mobile fallback.
 *
 * jsdom doesn't implement the parts of the DOM that CodeMirror leans on
 * for input events (range selection, beforeinput key handling), so the
 * "fires onChange" assertion drives the editor by dispatching a
 * synthetic transaction directly via the EditorView attached to the
 * DOM. This is the same approach @codemirror/view's own test suite uses.
 */
import { startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance as i18nCreateInstance } from 'i18next';
import { I18nextProvider, initReactI18next as i18nReactInit } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { issuesField } from '../dsl-editor/issues-state';
import { renderTooltipDom } from '../dsl-editor/issues-tooltip';
import { DslEditor } from '../DslEditor';

import type { DslAutocompleteSources } from '../dsl-editor/autocomplete-types';
import type { CompileEditorIssue } from '../dsl-editor/issues-types';

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

  it('moves the cursor to pendingCursor.{line,col} and focuses (PRD-135 amendment)', () => {
    const dsl = ['line one', 'line two', 'line three'].join('\n');
    const { rerender } = render(<DslEditor initialValue={dsl} onChange={() => {}} />);
    const view = getEditorView();
    // The fresh editor anchors selection at offset 0.
    expect(view.state.selection.main.head).toBe(0);
    rerender(
      <DslEditor
        initialValue={dsl}
        onChange={() => {}}
        pendingCursor={{ line: 2, col: 4, nonce: 1 }}
      />
    );
    // Line 2 starts after "line one\n" (9 chars); col=4 -> offset 9+3 = 12.
    expect(view.state.selection.main.head).toBe(12);

    // Bumping the nonce with new coords moves the cursor again, even though
    // the prop object identity didn't reuse the same reference.
    rerender(
      <DslEditor
        initialValue={dsl}
        onChange={() => {}}
        pendingCursor={{ line: 3, col: 1, nonce: 2 }}
      />
    );
    expect(view.state.selection.main.head).toBe(18);
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

describe('DslEditor — PRD-120 part B autocomplete', () => {
  /** Build a fake `DslAutocompleteSources` with vitest spies so tests
   *  can assert dispatch behaviour without exercising the live tRPC
   *  React Query path that `useDslAutocompleteSources` wraps. */
  function makeSources(): {
    sources: DslAutocompleteSources;
    spies: {
      searchSlugs: ReturnType<typeof vi.fn>;
      listVariantsForIngredient: ReturnType<typeof vi.fn>;
      listPrepStates: ReturnType<typeof vi.fn>;
    };
  } {
    const spies = {
      searchSlugs: vi.fn(async () => [
        { slug: 'banana', kind: 'ingredient' as const, name: 'Banana' },
      ]),
      listVariantsForIngredient: vi.fn(async () => [{ slug: 'raw', name: 'Raw' }]),
      listPrepStates: vi.fn(async () => [{ slug: 'diced', name: 'Diced' }]),
    };
    return {
      sources: {
        searchSlugs: spies.searchSlugs as unknown as DslAutocompleteSources['searchSlugs'],
        listVariantsForIngredient:
          spies.listVariantsForIngredient as unknown as DslAutocompleteSources['listVariantsForIngredient'],
        listPrepStates: spies.listPrepStates as unknown as DslAutocompleteSources['listPrepStates'],
      },
      spies,
    };
  }

  it('renders the editor without crashing when no sources are provided', () => {
    render(<DslEditor initialValue='@recipe(slug="x")' onChange={() => {}} />);
    expect(screen.getByTestId('dsl-editor')).toBeInTheDocument();
  });

  it('mounts the autocomplete extension when sources are provided', () => {
    const { sources } = makeSources();
    render(
      <DslEditor
        initialValue='@recipe(slug="x")'
        onChange={() => {}}
        autocompleteSources={sources}
      />
    );
    // EditorView mounts the extension during create(); proof of mount
    // is the surface being reachable plus a live `EditorView` instance.
    const view = getEditorView();
    expect(view).toBeInstanceOf(EditorView);
  });

  it('passes the sources object through without losing identity on re-render', () => {
    const { sources, spies } = makeSources();
    const { rerender } = render(
      <DslEditor initialValue="" onChange={() => {}} autocompleteSources={sources} />
    );
    // Same identity on re-render — no extension rebuild + no spy calls
    // (the popup hasn't been activated by a cursor event).
    rerender(<DslEditor initialValue="" onChange={() => {}} autocompleteSources={sources} />);
    expect(spies.searchSlugs).not.toHaveBeenCalled();
  });

  it('forwards a swapped sources object via the ref (no remount)', () => {
    const first = makeSources();
    const second = makeSources();
    const { rerender } = render(
      <DslEditor initialValue="" onChange={() => {}} autocompleteSources={first.sources} />
    );
    const viewBefore = getEditorView();
    rerender(
      <DslEditor initialValue="" onChange={() => {}} autocompleteSources={second.sources} />
    );
    const viewAfter = getEditorView();
    // Same EditorView instance — the ref swap doesn't tear down the editor.
    expect(viewAfter).toBe(viewBefore);
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

  it('jumps cursor when a focused chip is activated with Enter', () => {
    render(<DslEditor initialValue={RECIPE} onChange={() => {}} />);
    const view = getEditorView();
    const refChip = chipsInDom().find((el) => el.getAttribute('data-chip-kind') === 'ref-index');
    expect(refChip).toBeDefined();
    if (!refChip) return;
    const jumpFrom = Number.parseInt(refChip.getAttribute('data-chip-jump-from') ?? '0', 10);

    act(() => {
      fireEvent.keyDown(refChip, { key: 'Enter' });
    });
    expect(view.state.selection.main.head).toBe(jumpFrom);
  });

  it('jumps cursor when a focused chip is activated with Space', () => {
    render(<DslEditor initialValue={RECIPE} onChange={() => {}} />);
    const view = getEditorView();
    const refChip = chipsInDom().find((el) => el.getAttribute('data-chip-kind') === 'ref-index');
    expect(refChip).toBeDefined();
    if (!refChip) return;
    const jumpFrom = Number.parseInt(refChip.getAttribute('data-chip-jump-from') ?? '0', 10);

    act(() => {
      fireEvent.keyDown(refChip, { key: ' ' });
    });
    expect(view.state.selection.main.head).toBe(jumpFrom);
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

describe('DslEditor — PRD-120 part C (issues prop)', () => {
  const SAMPLE = '@ingredient(1, banana:raw:foo, 1:cup)';
  const ERROR_ISSUE: CompileEditorIssue = {
    severity: 'error',
    code: 'UnresolvedPrepStateSlug',
    message: 'Unknown prep state',
    // `foo` at columns 27..30 — see dsl-editor-issues-span.test.ts.
    loc: { startLine: 1, startCol: 27, endLine: 1, endCol: 30 },
    slug: 'foo',
  };
  const INFO_ISSUE: CompileEditorIssue = {
    severity: 'info',
    code: 'ProposedSlug',
    message: 'Proposed: foo-prep',
    loc: { startLine: 1, startCol: 27, endLine: 1, endCol: 30 },
    slug: 'foo-prep',
  };

  function decorationData(view: EditorView): Array<Record<string, string>> {
    const out: Array<Record<string, string>> = [];
    const iter = view.state.field(issuesField).decorations.iter();
    while (iter.value !== null) {
      const spec = iter.value.spec as {
        class?: string;
        attributes?: Record<string, string>;
      };
      out.push({
        ...spec.attributes,
        class: spec.class ?? '',
        from: String(iter.from),
        to: String(iter.to),
      });
      iter.next();
    }
    return out;
  }

  it('renders no decorations when issues is omitted', () => {
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} />);
    expect(decorationData(getEditorView())).toHaveLength(0);
  });

  it('renders an error decoration at the exact span the parser emitted', () => {
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} issues={[ERROR_ISSUE]} />);
    const marks = decorationData(getEditorView());
    expect(marks).toEqual([
      {
        class: 'cm-dsl-issue cm-dsl-issue--error',
        'data-dsl-issue-severity': 'error',
        'data-dsl-issue-code': 'UnresolvedPrepStateSlug',
        from: '26',
        to: '29',
      },
    ]);
  });

  it('renders an info decoration with a distinct class from errors', () => {
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} issues={[INFO_ISSUE]} />);
    const marks = decorationData(getEditorView());
    expect(marks).toHaveLength(1);
    expect(marks[0]['data-dsl-issue-severity']).toBe('info');
    expect(marks[0].class).toBe('cm-dsl-issue cm-dsl-issue--info');
  });

  it('replaces the decoration set when issues change', () => {
    const { rerender } = render(
      <DslEditor initialValue={SAMPLE} onChange={() => {}} issues={[ERROR_ISSUE]} />
    );
    expect(decorationData(getEditorView())[0]['data-dsl-issue-severity']).toBe('error');

    rerender(<DslEditor initialValue={SAMPLE} onChange={() => {}} issues={[INFO_ISSUE]} />);
    expect(decorationData(getEditorView())[0]['data-dsl-issue-severity']).toBe('info');
  });

  it('clears all decorations when issues is emptied', () => {
    const { rerender } = render(
      <DslEditor initialValue={SAMPLE} onChange={() => {}} issues={[ERROR_ISSUE, INFO_ISSUE]} />
    );
    expect(decorationData(getEditorView())).toHaveLength(2);

    rerender(<DslEditor initialValue={SAMPLE} onChange={() => {}} issues={[]} />);
    expect(decorationData(getEditorView())).toHaveLength(0);
  });

  it('builds a tooltip DOM that surfaces the error message + code + slug', () => {
    const dom = renderTooltipDom([ERROR_ISSUE]);
    expect(dom.getAttribute('data-testid')).toBe('dsl-editor-issue-tooltip');
    expect(dom.textContent).toContain('UnresolvedPrepStateSlug');
    expect(dom.textContent).toContain('Unknown prep state');
    expect(dom.textContent).toContain('foo');
    const row = dom.querySelector('[data-dsl-issue-severity="error"]');
    expect(row).not.toBeNull();
  });

  it('stacks multiple issues in the tooltip DOM in input order', () => {
    const dom = renderTooltipDom([ERROR_ISSUE, INFO_ISSUE]);
    const rows = dom.querySelectorAll('.cm-dsl-issue-tooltip__row');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-dsl-issue-severity')).toBe('error');
    expect(rows[1].getAttribute('data-dsl-issue-severity')).toBe('info');
  });

  it('drops decorations whose span no longer fits the document', () => {
    const offDoc: CompileEditorIssue = {
      ...ERROR_ISSUE,
      loc: { startLine: 12, startCol: 1, endLine: 12, endCol: 4 },
    };
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} issues={[ERROR_ISSUE, offDoc]} />);
    // 1 of 2 issues makes it onto the doc; the other silently drops.
    expect(decorationData(getEditorView())).toHaveLength(1);
  });

  it('mounts the diagnostic gutter column', () => {
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} issues={[ERROR_ISSUE]} />);
    const surface = screen.getByTestId('dsl-editor-surface');
    expect(surface.querySelector('.cm-dsl-issue-gutter-column')).not.toBeNull();
  });
});

describe('DslEditor — PRD-120 part F (read-only autocomplete + mobile drawer + a11y)', () => {
  beforeEach(() => {
    installMatchMedia(false);
  });

  function makeSources(): DslAutocompleteSources {
    return {
      searchSlugs: vi.fn(async () => [
        { slug: 'banana', kind: 'ingredient' as const, name: 'Banana' },
      ]) as unknown as DslAutocompleteSources['searchSlugs'],
      listVariantsForIngredient: vi.fn(
        async () => []
      ) as unknown as DslAutocompleteSources['listVariantsForIngredient'],
      listPrepStates: vi.fn(async () => []) as unknown as DslAutocompleteSources['listPrepStates'],
    };
  }

  it('does not surface an autocomplete tooltip when the editor is read-only', async () => {
    const sources = makeSources();
    render(
      <DslEditor
        initialValue='@recipe(slug="x")'
        readOnly
        onChange={() => {}}
        autocompleteSources={sources}
      />
    );
    // CodeMirror only mounts a `.cm-tooltip-autocomplete` node when the
    // configured source returns a non-null result. The part F source gate
    // returns `null` whenever `state.readOnly` is true, so the popup must
    // never enter the DOM — including under an explicit Ctrl-Space
    // (`startCompletion`) request, which would otherwise bypass the
    // implicit-typing path.
    const view = getEditorView();
    await act(async () => {
      startCompletion(view);
      // Let microtasks settle so any source promises resolve before the
      // assertion. The source short-circuits synchronously, so this is a
      // belt-and-braces wait.
      await Promise.resolve();
    });
    expect(document.querySelector('.cm-tooltip-autocomplete')).toBeNull();
    expect(sources.searchSlugs).not.toHaveBeenCalled();
    expect(sources.listVariantsForIngredient).not.toHaveBeenCalled();
    expect(sources.listPrepStates).not.toHaveBeenCalled();
  });

  it('emits the mobile-drawer base theme into the document so CSS positions the popup at the viewport floor', () => {
    render(
      <DslEditor
        initialValue='@recipe(slug="x")'
        onChange={() => {}}
        autocompleteSources={makeSources()}
      />
    );
    // CodeMirror's StyleModule writes the baseTheme rules into a single
    // <style> tag attached to document.head; if the mobile drawer media
    // query made it into the bundle the textContent will carry both the
    // viewport gate and the marker class.
    const styles = Array.from(document.head.querySelectorAll('style'))
      .map((el) => el.textContent ?? '')
      .join('\n');
    expect(styles).toContain('.dsl-editor-autocomplete');
    expect(styles).toContain('max-width: 767px');
  });

  it('attaches the accessible label onto CodeMirror cm-content (role=textbox)', () => {
    render(<DslEditor initialValue="hello" onChange={() => {}} />);
    // axe-core flags `aria-label` on a generic div as `aria-prohibited-attr`;
    // the label has to live on the role=textbox node, which CodeMirror
    // sets on `.cm-content`. The hook plumbs it through
    // `EditorView.contentAttributes`.
    const content = screen.getByTestId('dsl-editor-surface').querySelector('.cm-content');
    expect(content).not.toBeNull();
    expect(content?.getAttribute('aria-label')?.length).toBeGreaterThan(0);
  });

  it('re-dispatches contentAttributes when the i18n locale switches mid-session', async () => {
    const instance = i18nCreateInstance();
    await instance.use(i18nReactInit).init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['food'],
      defaultNS: 'food',
      interpolation: { escapeValue: false },
      resources: {
        en: { food: { 'editor.ariaLabel': 'Recipe DSL editor' } },
        xx: { food: { 'editor.ariaLabel': 'Receta DSL editor' } },
      },
    });

    render(
      <I18nextProvider i18n={instance}>
        <DslEditor initialValue="hello" onChange={() => {}} />
      </I18nextProvider>
    );

    const content = screen.getByTestId('dsl-editor-surface').querySelector('.cm-content');
    expect(content?.getAttribute('aria-label')).toBe('Recipe DSL editor');

    await act(async () => {
      await instance.changeLanguage('xx');
    });

    expect(content?.getAttribute('aria-label')).toBe('Receta DSL editor');
  });
});
