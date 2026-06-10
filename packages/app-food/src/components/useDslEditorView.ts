/**
 * Owns the imperative CodeMirror 6 lifecycle for the DSL editor:
 * mounts a single `EditorView`, swaps `readOnly` / `ariaLabel` /
 * chip-widgets via `Compartment.reconfigure` (so undo + cursor survive),
 * pipes the document back through a 250 ms debounce, and lets the
 * autocomplete extension read the latest sources via a ref proxy. Reach
 * for `EditorView.findFromDOM` from tests instead of returning the view.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import { recipeDsl } from '../dsl/codemirror';
import { dslAutocompletion } from './dsl-editor/autocomplete-extension';
import { chipWidgetsExtension } from './dsl-editor/chip-widgets-extension';
import { issuesExtension, setIssuesEffect } from './dsl-editor/issues-extension';
import { usePendingCursor } from './useDslEditorPendingCursor.js';

import type { DslAutocompleteSources } from './dsl-editor/autocomplete-types';
import type { CompileEditorIssue } from './dsl-editor/issues-types';

const DEBOUNCE_MS = 250;
const MOBILE_QUERY = '(max-width: 767px)';

export interface UseDslEditorViewOptions {
  initialValue: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  issues: readonly CompileEditorIssue[];
  /**
   * Autocomplete lookups. When `null`, the extension still mounts but every
   * source resolves to an empty list — useful in tests that don't want to
   * stub the lookups.
   */
  autocompleteSources: DslAutocompleteSources | null;
  /**
   * Accessible name for CodeMirror's contenteditable surface (the
   * `.cm-content` element). Attached via `EditorView.contentAttributes`
   * so it lands on the role=textbox node where axe-core expects it,
   * rather than the wrapper div (PRD-120 part F).
   */
  ariaLabel?: string;
  /**
   * Imperative cursor move target — set by PRD-135's decision pane when the
   * user clicks a proposed-slug entry. The hook watches the entire object
   * identity, so callers should provide a stable reference and bump the
   * `nonce` (or supply a fresh object) when they want the cursor to move.
   * `line` is 1-indexed; `col` is 1-indexed inside the line, matching the
   * `SourceSpan` shape PRD-114 emits.
   */
  pendingCursor?: { line: number; col: number; nonce: number };
}

interface ViewCompartments {
  readOnly: Compartment;
  chips: Compartment;
  ariaLabel: Compartment;
}

export function useDslEditorView(
  hostRef: MutableRefObject<HTMLDivElement | null>,
  options: UseDslEditorViewOptions
): void {
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<ViewCompartments>({
    readOnly: new Compartment(),
    chips: new Compartment(),
    ariaLabel: new Compartment(),
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartmentsRef.current.ariaLabel.reconfigure(
        buildAriaLabelExtension(options.ariaLabel)
      ),
    });
  }, [options.ariaLabel]);

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

  usePendingCursor(viewRef, options.pendingCursor);
}

function buildReadOnlyExtension(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

/** Wraps the editor's accessible name in a `contentAttributes` facet so a
 *  locale switch (i18n.changeLanguage) re-dispatches into the same
 *  compartment and the role=textbox node tracks the active language. */
function buildAriaLabelExtension(ariaLabel: string | undefined) {
  return ariaLabel ? EditorView.contentAttributes.of({ 'aria-label': ariaLabel }) : [];
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
  // Initial `options.issues` is seeded by `useSyncEffects` (one dispatch
  // post-mount); seeding here would double-render — see PR #2716.
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
        compartments.ariaLabel.of(buildAriaLabelExtension(options.ariaLabel)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit(update.state.doc.toString());
        }),
      ],
    }),
    parent: host,
  });
}

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
