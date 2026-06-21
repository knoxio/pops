/**
 * Recipe-DSL CodeMirror 6 editor. Pure presentation:
 *   - Lezer-driven syntax highlighting (function names, descriptors,
 *     strings, numbers, comments).
 *   - `onChange(value)` fires after a 250 ms debounce.
 *   - Switches into read-only mode (no keystrokes, banner at the top) when
 *     `readOnly` is true.
 *   - Surfaces compile diagnostics passed via `issues` as inline squiggles,
 *     a gutter marker, and a hover tooltip.
 *
 * Framework-thin: owns a single `EditorView` and rebuilds the document only
 * when `initialValue` changes from outside. Parents must treat `onChange`
 * as the source of truth and avoid re-pumping the same value back.
 */
import { EditorView } from '@codemirror/view';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { ReorderIngredientsPanel } from './dsl-editor/ReorderIngredientsPanel';
import { useReorderController } from './dsl-editor/useReorderController';
import { useDslEditorView } from './useDslEditorView';

import type { DslAutocompleteSources } from './dsl-editor/autocomplete-types';
import type { CompileEditorIssue } from './dsl-editor/issues-types';

export interface DslEditorProps {
  /** Current `body_dsl` string. */
  initialValue: string;
  /** Fires with the latest editor value, debounced 250 ms. */
  onChange: (value: string) => void;
  /**
   * Diagnostics rendered as inline decorations + a gutter marker + a hover
   * tooltip. Defaults to an empty array.
   */
  issues?: readonly CompileEditorIssue[];
  /** True for `current`/`archived` versions. */
  readOnly?: boolean;
  /** Extra class on the wrapping div for layout integration. */
  className?: string;
  /**
   * Autocomplete lookups. When omitted, the dropdown stays empty.
   * Production wiring uses `useDslAutocompleteSources()` which wraps tRPC
   * + React Query.
   */
  autocompleteSources?: DslAutocompleteSources;
  /**
   * PRD-135 — imperative cursor move target. The DecisionPane sets this
   * when the user clicks a proposed-slug entry; the editor scrolls + sets
   * the selection at `{ line, col }` and focuses. `nonce` lets callers
   * re-trigger the move with the same coordinates (e.g. clicking the same
   * entry twice). `line` + `col` are 1-indexed to match `SourceSpan`.
   */
  pendingCursor?: { line: number; col: number; nonce: number };
}

const EMPTY_ISSUES: readonly CompileEditorIssue[] = Object.freeze([]);

export function DslEditor(props: DslEditorProps) {
  const { t } = useTranslation('food');
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Memoise the resolved issues reference so the hook's `useEffect` only
  // re-dispatches when the caller passes a genuinely new array (a fresh
  // empty literal each render would otherwise thrash the editor).
  const issues = useMemo(() => props.issues ?? EMPTY_ISSUES, [props.issues]);
  const readOnly = props.readOnly === true;
  useDslEditorView(hostRef, {
    initialValue: props.initialValue,
    onChange: props.onChange,
    readOnly,
    issues,
    autocompleteSources: props.autocompleteSources ?? null,
    ariaLabel: t('editor.ariaLabel'),
    pendingCursor: props.pendingCursor,
  });

  const getView = useCallback((): EditorView | null => {
    const host = hostRef.current;
    if (host === null) return null;
    const cm = host.querySelector('.cm-editor');
    return cm === null ? null : (EditorView.findFromDOM(cm as HTMLElement) ?? null);
  }, []);
  const reorder = useReorderController({ getView });

  const wrapperClass = ['dsl-editor', props.className].filter(Boolean).join(' ');
  return (
    <div className={wrapperClass} data-testid="dsl-editor">
      <DslEditorHeader readOnly={readOnly} onOpenReorder={() => reorder.setOpen(true)} />
      <div ref={hostRef} className="dsl-editor__surface" data-testid="dsl-editor-surface" />
      <ReorderIngredientsPanel
        open={reorder.open}
        onOpenChange={reorder.setOpen}
        declarations={reorder.declarations}
        onApply={reorder.apply}
      />
    </div>
  );
}

function DslEditorHeader({
  readOnly,
  onOpenReorder,
}: {
  readOnly: boolean;
  onOpenReorder: () => void;
}) {
  const { t } = useTranslation('food');
  if (readOnly) {
    return (
      <div
        role="status"
        className="dsl-editor__readonly-banner"
        data-testid="dsl-editor-readonly-banner"
      >
        {t('editor.readOnlyBanner')}
      </div>
    );
  }
  return (
    <div className="dsl-editor__toolbar flex items-center gap-2" data-testid="dsl-editor-toolbar">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpenReorder}
        data-testid="dsl-editor-reorder-open"
      >
        {t('editor.reorder.open')}
      </Button>
    </div>
  );
}
