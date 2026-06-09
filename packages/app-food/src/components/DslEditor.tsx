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
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useDslEditorView } from './useDslEditorView';

import type { CompileEditorIssue } from './dsl-editor/issues-types';

/** Public props — kept narrow so 120-B/C can extend without breaking
 * earlier callers. */
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
}

const EMPTY_ISSUES: readonly CompileEditorIssue[] = Object.freeze([]);

export function DslEditor(props: DslEditorProps) {
  const { t } = useTranslation('food');
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Memoise the resolved issues reference so the hook's `useEffect` only
  // re-dispatches when the caller passes a genuinely new array (a fresh
  // empty literal each render would otherwise thrash the editor).
  const issues = useMemo(() => props.issues ?? EMPTY_ISSUES, [props.issues]);
  useDslEditorView(hostRef, {
    initialValue: props.initialValue,
    onChange: props.onChange,
    readOnly: props.readOnly === true,
    issues,
  });

  const wrapperClass = ['dsl-editor', props.className].filter(Boolean).join(' ');
  return (
    <div className={wrapperClass} data-testid="dsl-editor">
      {props.readOnly === true ? (
        <div
          role="status"
          className="dsl-editor__readonly-banner"
          data-testid="dsl-editor-readonly-banner"
        >
          {t('editor.readOnlyBanner')}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="dsl-editor__surface"
        data-testid="dsl-editor-surface"
        aria-label={t('editor.ariaLabel')}
      />
    </div>
  );
}
