/**
 * `useDslEditorView` — owns the imperative CodeMirror 6 lifecycle for the
 * DSL editor (PRD-120 part A).
 *
 * Pulled out of `DslEditor.tsx` so the component itself stays under the
 * lint cap and the React surface is purely declarative. The hook:
 *
 *   - Mounts a single `EditorView` into the supplied host div on first
 *     render and tears it down on unmount.
 *   - Toggles `EditorState.readOnly` + `EditorView.editable` via a
 *     `Compartment.reconfigure` transaction so the swap doesn't blow away
 *     the undo history or cursor position.
 *   - Re-syncs the document when `initialValue` changes from outside
 *     (parent loaded a new version). One-way only — the parent owns the
 *     canonical value via the debounced `onChange`.
 *
 * The hook deliberately doesn't return the `EditorView`; callers that
 * need it (tests, future autocomplete plumbing) reach for
 * `EditorView.findFromDOM(host.querySelector('.cm-editor'))` instead.
 * That keeps the React render path immune to the imperative view's
 * mutation timeline.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useCallback, useEffect, useRef } from 'react';

import { recipeDsl } from '../dsl/codemirror';

const DEBOUNCE_MS = 250;

export interface UseDslEditorViewOptions {
  initialValue: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}

export function useDslEditorView(
  hostRef: React.MutableRefObject<HTMLDivElement | null>,
  options: UseDslEditorViewOptions
): void {
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment>(new Compartment());
  const onChangeRef = useRef(options.onChange);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = options.onChange;
  }, [options.onChange]);

  const emit = useCallback((value: string): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeRef.current(value);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const view = createEditorView(host, options, readOnlyCompartmentRef.current, emit);
    viewRef.current = view;
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      view.destroy();
      viewRef.current = null;
    };
    // Mount-only effect; subsequent prop changes are routed through the
    // dedicated effects below so we keep undo history + cursor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure(buildReadOnlyExtension(options.readOnly)),
    });
  }, [options.readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === options.initialValue) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: options.initialValue },
    });
  }, [options.initialValue]);
}

function buildReadOnlyExtension(
  readOnly: boolean
): readonly [
  ReturnType<typeof EditorState.readOnly.of>,
  ReturnType<typeof EditorView.editable.of>,
] {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function createEditorView(
  host: HTMLDivElement,
  options: UseDslEditorViewOptions,
  compartment: Compartment,
  emit: (value: string) => void
): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: options.initialValue,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        recipeDsl(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        compartment.of(buildReadOnlyExtension(options.readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit(update.state.doc.toString());
        }),
      ],
    }),
    parent: host,
  });
}
