/**
 * DslEditor — recipe-DSL CodeMirror 6 editor (PRD-120 parts A + C).
 *
 * Pure presentation component. The editor:
 *   - Renders the recipe-DSL source with Lezer-driven syntax highlighting
 *     (function names, descriptors, strings, numbers, comments).
 *   - Fires `onChange(value)` after a 250 ms debounce so the parent isn't
 *     thrashed on every keystroke.
 *   - Switches into read-only mode (no keystrokes, banner at the top) when
 *     `readOnly` is true — the parent is expected to pass this for any
 *     `recipe_versions.status ∈ {current, archived}` per PRD-107.
 *   - Surfaces compile diagnostics passed via `issues` as inline
 *     squiggles, a gutter marker, and a hover tooltip (120-C).
 *
 * Still out of scope for this PR (deferred to 120-B / 120-D / 120-E /
 * 120-F):
 *   - Autocomplete (consumes `food.slugs.search` from PRD-122-API).
 *   - Chip widgets for inline `@N` / `@slug` / `@time` / `@temperature`.
 *   - Reorder + renumber affordance.
 *   - Mobile-specific autocomplete drawer + axe-core a11y pass.
 *   - The "Recompile" button — parent-driven, lands with PRD-119.
 *
 * The component is deliberately framework-thin: it owns a single
 * `EditorView` instance and rebuilds the document only when `initialValue`
 * changes from outside (e.g. the parent loaded a new version). External
 * changes never collide with in-flight user edits because the parent is
 * supposed to treat `onChange` as the source of truth and not re-pump the
 * same value back as a new `initialValue`.
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

/** Public props — kept narrow so future 120 parts can extend without
 * breaking earlier callers. */
export interface DslEditorProps {
  /** Current `body_dsl` string. */
  initialValue: string;
  /** Fires with the latest editor value, debounced 250 ms. */
  onChange: (value: string) => void;
  /**
   * Diagnostics rendered as inline decorations + a gutter marker + a
   * hover tooltip. The parent (PRD-119, downstream) assembles this list
   * from `food.recipes.saveDraft`'s `CompileResult` plus any
   * `recipe_version_proposed_slugs` rows fetched via
   * `food.recipes.listProposedSlugs(versionId)`. Defaults to an empty
   * array.
   */
  issues?: readonly CompileEditorIssue[];
  /** True for `current`/`archived` versions per PRD-107. */
  readOnly?: boolean;
  /** Extra class on the wrapping div for layout integration. */
  className?: string;
  /** Autocomplete lookups (PRD-120 part B). When omitted, the
   *  autocomplete dropdown stays empty. Production wiring uses
   *  `useDslAutocompleteSources()` which wraps tRPC + React Query. */
  autocompleteSources?: DslAutocompleteSources;
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
      <div
        ref={hostRef}
        className="dsl-editor__surface"
        data-testid="dsl-editor-surface"
        aria-label={t('editor.ariaLabel')}
      />
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
