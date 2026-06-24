/**
 * DslEditor — reorder + renumber RTL tests.
 *
 * Exercises the toolbar button, the modal's reorder controls, and the
 * single-transaction renumber dispatch into the editor view. The pure
 * renumber transform has its own deep coverage in
 * `src/dsl/__tests__/renumber.test.ts`; these tests focus on the React/CM
 * integration surface.
 */
import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DslEditor } from '../DslEditor';

const SAMPLE = [
  '@recipe(slug="x", title="X")',
  '',
  '@yield(x, 1:count)',
  '',
  '@ingredient(1, salt, 1:g)',
  '',
  '@ingredient(2, sugar, 2:g)',
  '',
  '@ingredient(3, water, 100:ml)',
  '',
  '@step("Combine @1, @2, and @3.")',
].join('\n');

function getEditorView(): EditorView {
  const surface = screen.getByTestId('dsl-editor-surface');
  const cm = surface.querySelector('.cm-editor');
  if (cm === null) throw new Error('no cm-editor in DOM');
  const view = EditorView.findFromDOM(cm as HTMLElement);
  if (view === null) throw new Error('no view attached');
  return view;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DslEditor reorder', () => {
  it('hides the reorder button in read-only mode', () => {
    render(<DslEditor initialValue={SAMPLE} readOnly onChange={() => {}} />);
    expect(screen.queryByTestId('dsl-editor-reorder-open')).toBeNull();
  });

  it('opens the panel and lists current @ingredient slugs', async () => {
    const user = userEvent.setup();
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} />);

    await user.click(screen.getByTestId('dsl-editor-reorder-open'));

    expect(screen.getByTestId('dsl-editor-reorder-panel')).toBeInTheDocument();
    const list = screen.getByTestId('dsl-editor-reorder-list');
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('salt');
    expect(items[1]?.textContent).toContain('sugar');
    expect(items[2]?.textContent).toContain('water');
  });

  it('shows the empty-state message when there are no @ingredient blocks', async () => {
    const user = userEvent.setup();
    render(
      <DslEditor
        initialValue='@recipe(slug="x", title="X")\n@yield(x, 1:count)'
        onChange={() => {}}
      />
    );
    await user.click(screen.getByTestId('dsl-editor-reorder-open'));
    expect(screen.getByTestId('dsl-editor-reorder-empty')).toBeInTheDocument();
  });

  it('disables the Apply button on identity order and enables it after a move', async () => {
    const user = userEvent.setup();
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} />);
    await user.click(screen.getByTestId('dsl-editor-reorder-open'));

    expect(screen.getByTestId('dsl-editor-reorder-apply')).toBeDisabled();

    await user.click(screen.getByTestId('dsl-editor-reorder-down-0'));
    expect(screen.getByTestId('dsl-editor-reorder-apply')).toBeEnabled();
  });

  it('applies a swap and rewrites step refs in a single CodeMirror transaction', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string) => void>();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<DslEditor initialValue={SAMPLE} onChange={onChange} />);
    const view = getEditorView();

    await user.click(screen.getByTestId('dsl-editor-reorder-open'));
    await user.click(screen.getByTestId('dsl-editor-reorder-down-0'));
    await user.click(screen.getByTestId('dsl-editor-reorder-apply'));

    const after = view.state.doc.toString();
    expect(after).toContain('@ingredient(1, sugar, 2:g)');
    expect(after).toContain('@ingredient(2, salt, 1:g)');
    expect(after).toContain('Combine @2, @1, and @3.');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(after);
  });

  it('produces a single undoable transaction (one undo reverts the whole renumber)', async () => {
    const user = userEvent.setup();
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} />);
    const view = getEditorView();

    await user.click(screen.getByTestId('dsl-editor-reorder-open'));
    await user.click(screen.getByTestId('dsl-editor-reorder-down-0'));
    await user.click(screen.getByTestId('dsl-editor-reorder-apply'));

    expect(view.state.doc.toString()).not.toBe(SAMPLE);

    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe(SAMPLE);
  });

  it('closes the dialog and dispatches nothing when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<DslEditor initialValue={SAMPLE} onChange={() => {}} />);
    const view = getEditorView();

    await user.click(screen.getByTestId('dsl-editor-reorder-open'));
    await user.click(screen.getByTestId('dsl-editor-reorder-down-0'));
    await user.click(screen.getByTestId('dsl-editor-reorder-cancel'));

    expect(screen.queryByTestId('dsl-editor-reorder-panel')).toBeNull();
    expect(view.state.doc.toString()).toBe(SAMPLE);
  });
});
