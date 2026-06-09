/**
 * `useDslEditorView` — owns the imperative CodeMirror 6 lifecycle for the
 * DSL editor (PRD-120 part A; autocomplete extension added in 120-B;
 * issues / squiggles / tooltip in 120-C; chip widgets + mobile fallback
 * in 120-D).
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
 *   - Watches `window.matchMedia('(max-width: 767px)')` and reconfigures
 *     the chip-widgets compartment between desktop (widget-replace) and
 *     mobile (inline-mark) renderings. The swap is a compartment
 *     reconfigure so cursor + undo state stay intact when the user rotates
 *     a tablet or resizes the window.
 *   - Reads autocomplete lookups through a ref-backed proxy so the
 *     extension picks up source swaps from PRD-120 part B without
 *     re-mounting the EditorView.
 *
 * The hook deliberately doesn't return the `EditorView`; callers that
 * need it (tests, future plumbing) reach for
 * `EditorView.findFromDOM(host.querySelector('.cm-editor'))` instead.
 * That keeps the React render path immune to the imperative view's
 * mutation timeline.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import { recipeDsl } from '../dsl/codemirror';

import { dslAutocompletion } from './dsl-editor/autocomplete-extension';
import type { DslAutocompleteSources } from './dsl-editor/autocomplete-types';
import { chipWidgetsExtension } from './dsl-editor/chip-widgets-extension';
import { issuesExtension, setIssuesEffect } from './dsl-editor/issues-extension';
import type { CompileEditorIssue } from './dsl-editor/issues-types';

const DEBOUNCE_MS = 250;
const MOBILE_QUERY = '(max-width: 767px)';

export interface UseDslEditorViewOptions {
  initialValue: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  issues: readonly CompileEditorIssue[];
  /** Autocomplete lookups (PRD-120 part B). When `null`, the
   *  autocomplete extension still mounts but every source resolves to
   *  an empty list — useful in tests that don't want to stub the
   *  lookups and in callers that haven't wired up the React Query hook
   *  yet. */
  autocompleteSources: DslAutocompleteSources | null;
}

interface ViewCompartments {
  readOnly: Compartment;
  chips: Compartment;
}

export function useDslEditorView(
  hostRef: MutableRefObject<HTMLDivElement | null>,
  options: UseDslEditorViewOptions
): void {
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<ViewCompartments>({
    readOnly: new Compartment(),
    chips: new Compartment(),
  });
  const onChangeRef = useRef(options.onChange);
  // Sources are stashed in a ref so the autocomplete extension — which
  // is closed-over at mount — can always read the current lookups
  // without us rebuilding the EditorView when callers hand a fresh
  // object identity on every render (common in tests).
  const sourcesRef = useRef<DslAutocompleteSources | null>(options.autocompleteSources);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = options.onChange;
  }, [options.onChange]);

  useEffect(() => {
    sourcesRef.current = options.autocompleteSources;
  }, [options.autocompleteSources]);

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
    return mountEditorView({
      host,
      options,
      compartments: compartmentsRef.current,
      emit,
      sourcesRef,
      viewRef,
      debounceRef,
    });
    // Mount-only effect; subsequent prop changes are routed through the
    // dedicated effects below so we keep undo history + cursor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartmentsRef.current.readOnly.reconfigure(
        buildReadOnlyExtension(options.readOnly)
      ),
    });
  }, [options.readOnly]);

  useSyncEffects(viewRef, options);
}

function useSyncEffects(
  viewRef: MutableRefObject<EditorView | null>,
  options: UseDslEditorViewOptions
): void {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === options.initialValue) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: options.initialValue },
    });
  }, [options.initialValue, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setIssuesEffect.of([...options.issues]) });
  }, [options.issues, viewRef]);
}

function buildReadOnlyExtension(
  readOnly: boolean
): readonly [
  ReturnType<typeof EditorState.readOnly.of>,
  ReturnType<typeof EditorView.editable.of>,
] {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function detectCompactInitial(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function watchMobileQuery(view: EditorView, chipsCompartment: Compartment): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  const apply = (matches: boolean): void => {
    view.dispatch({
      effects: chipsCompartment.reconfigure(chipWidgetsExtension({ compact: matches })),
    });
  };
  const listener = (event: MediaQueryListEvent): void => apply(event.matches);
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

interface CreateEditorViewArgs {
  options: UseDslEditorViewOptions;
  compartments: ViewCompartments;
  emit: (value: string) => void;
  sourcesRef: MutableRefObject<DslAutocompleteSources | null>;
}

interface MountEditorViewArgs extends CreateEditorViewArgs {
  host: HTMLDivElement;
  viewRef: MutableRefObject<EditorView | null>;
  debounceRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/** Mount the EditorView for the lifetime of the host effect and return
 *  the React-style cleanup. Pulled out of `useDslEditorView` so that
 *  hook stays under the per-function line cap once the compartment +
 *  mobile-query + autocomplete plumbing all land in the same mount
 *  callback. */
function mountEditorView(args: MountEditorViewArgs): () => void {
  const { host, options, compartments, emit, sourcesRef, viewRef, debounceRef } = args;
  const view = createEditorView(host, { options, compartments, emit, sourcesRef });
  viewRef.current = view;
  const stopMql = watchMobileQuery(view, compartments.chips);
  return () => {
    stopMql();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    view.destroy();
    viewRef.current = null;
  };
}

function createEditorView(host: HTMLDivElement, args: CreateEditorViewArgs): EditorView {
  const { options, compartments, emit, sourcesRef } = args;
  // Initial `options.issues` is seeded by the `useEffect(..., [options.issues])`
  // block in `useSyncEffects`, which fires once after mount — dispatching
  // here would double-render (PR #2716 review feedback).
  const compact = detectCompactInitial();
  return new EditorView({
    state: EditorState.create({
      doc: options.initialValue,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        recipeDsl(),
        issuesExtension(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        compartments.readOnly.of(buildReadOnlyExtension(options.readOnly)),
        compartments.chips.of(chipWidgetsExtension({ compact })),
        dslAutocompletion(buildSourcesProxy(sourcesRef)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit(update.state.doc.toString());
        }),
      ],
    }),
    parent: host,
  });
}

/** Indirect every lookup through the ref so the autocomplete extension
 *  observes the latest sources without forcing a re-mount. When the
 *  caller hasn't provided sources the proxy returns empty lists,
 *  which the CodeMirror source folds into a `null` result. */
function buildSourcesProxy(
  ref: MutableRefObject<DslAutocompleteSources | null>
): DslAutocompleteSources {
  return {
    searchSlugs: async (query, kinds) => {
      const s = ref.current;
      return s === null ? [] : await s.searchSlugs(query, kinds);
    },
    listVariantsForIngredient: async (slug) => {
      const s = ref.current;
      return s === null ? [] : await s.listVariantsForIngredient(slug);
    },
    listPrepStates: async () => {
      const s = ref.current;
      return s === null ? [] : await s.listPrepStates();
    },
  };
}
