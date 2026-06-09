/**
 * CodeMirror extension wiring for the DSL chip widgets (PRD-120 part D).
 *
 * Two visual modes selected by the caller:
 *
 *   - `chipWidgetsExtension({ compact: false })` — replaces each chip range
 *     with a `WidgetType` (the default desktop behaviour).
 *   - `chipWidgetsExtension({ compact: true })` — uses `Decoration.mark`
 *     instead so the source characters stay visible. PRD-120 calls this out
 *     for mobile widths (<768px): widget replacement shrinks tap targets
 *     dangerously, so on mobile the chip becomes an inline label that
 *     simply colours the source range.
 *
 * The matchMedia → compartment dance that picks between the two lives in
 * `useDslEditorView.ts`; this module just builds the extension array.
 */
import { EditorSelection, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view';

import { scanForChips } from './chip-scanner';
import { InlineFuncPillWidget, RefIndexChipWidget, RefSlugChipWidget } from './chip-widgets';

import type { EditorState } from '@codemirror/state';

import type {
  Chip,
  ChipScanResult,
  IngredientDeclaration,
  InlineFuncChip,
  RefIndexChip,
  RefSlugChip,
} from './chip-scanner-types';

export interface ChipWidgetsOptions {
  /** Mobile fallback — use `Decoration.mark` instead of widget replacement. */
  compact?: boolean;
}

function buildDecorations(state: EditorState, compact: boolean): DecorationSet {
  const scan = scanForChips(state.doc.toString());
  const ranges = scan.chips.map((chip) => decorationFor(chip, scan.declarations, compact));
  ranges.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(ranges, true);
}

function decorationFor(
  chip: Chip,
  declarations: ChipScanResult['declarations'],
  compact: boolean
): { from: number; to: number; value: Decoration } {
  if (chip.kind === 'ref-index') return decorationForRefIndex(chip, declarations, compact);
  if (chip.kind === 'ref-slug') return decorationForRefSlug(chip, compact);
  return decorationForInlineFunc(chip, compact);
}

function decorationForRefIndex(
  chip: RefIndexChip,
  declarations: ChipScanResult['declarations'],
  compact: boolean
): { from: number; to: number; value: Decoration } {
  const decl = declarations.get(chip.index);
  const label = decl ? labelFor(decl) : `@${chip.index}`;
  const jumpFrom = decl?.callStart ?? null;
  const value = compact
    ? Decoration.mark({
        class: classFor('ref-index', !decl),
        attributes: jumpAttrs('ref-index', jumpFrom, !decl),
      })
    : Decoration.replace({
        widget: new RefIndexChipWidget({
          index: chip.index,
          label,
          title: titleFor(decl, `@${chip.index}`),
          jumpFrom,
          hasError: !decl,
        }),
      });
  return { from: chip.from, to: chip.to, value };
}

function decorationForRefSlug(
  chip: RefSlugChip,
  compact: boolean
): { from: number; to: number; value: Decoration } {
  const value = compact
    ? Decoration.mark({
        class: classFor('ref-slug', false),
        attributes: jumpAttrs('ref-slug', null, false),
      })
    : Decoration.replace({
        widget: new RefSlugChipWidget({ slug: chip.slug, title: chip.slug, jumpFrom: null }),
      });
  return { from: chip.from, to: chip.to, value };
}

function decorationForInlineFunc(
  chip: InlineFuncChip,
  compact: boolean
): { from: number; to: number; value: Decoration } {
  const label = formatPillLabel(chip);
  const value = compact
    ? Decoration.mark({ class: `cm-dsl-chip cm-dsl-chip--inline cm-dsl-chip--${chip.kind}` })
    : Decoration.replace({ widget: new InlineFuncPillWidget({ kind: chip.kind, label }) });
  return { from: chip.from, to: chip.to, value };
}

function labelFor(decl: IngredientDeclaration): string {
  if (decl.variant) return `${decl.slug}:${decl.variant}`;
  return decl.slug;
}

function titleFor(decl: IngredientDeclaration | undefined, fallback: string): string {
  if (!decl) return fallback;
  return [decl.slug, decl.variant, decl.prep].filter((p): p is string => Boolean(p)).join(':');
}

function classFor(kind: 'ref-index' | 'ref-slug', hasError: boolean): string {
  return `cm-dsl-chip cm-dsl-chip--inline cm-dsl-chip--${kind}${
    hasError ? ' cm-dsl-chip--error' : ''
  }`;
}

function jumpAttrs(
  kind: 'ref-index' | 'ref-slug',
  jumpFrom: number | null,
  hasError: boolean
): Record<string, string> {
  const attrs: Record<string, string> = { 'data-chip-kind': kind };
  if (jumpFrom !== null) {
    attrs['data-chip-jump-from'] = String(jumpFrom);
    attrs.role = 'button';
    attrs.tabindex = '0';
  }
  if (hasError) attrs['data-chip-error'] = 'true';
  return attrs;
}

function formatPillLabel(chip: InlineFuncChip): string {
  if (chip.kind === 'time') return `${chip.qty} ${chip.unit}`;
  const unit = chip.unit.toLowerCase();
  if (unit === 'c' || unit === 'f') return `${chip.qty} °${unit.toUpperCase()}`;
  return `${chip.qty} ${chip.unit}`;
}

/**
 * Click + keyboard activation routing for chip widgets. Implemented as a
 * `ViewPlugin` that attaches listeners directly to `view.contentDOM`. We
 * tried `EditorView.domEventHandlers({ click })` first, but its
 * event-routing pipeline doesn't fire reliably for synthetic clicks on
 * widget DOM in jsdom — attaching directly to `contentDOM` bypasses that
 * and lets the tests drive the chip via `fireEvent.click`. The keydown
 * handler covers Enter/Space so chips stay reachable via Tab → activate,
 * which the PRD calls out as an accessibility requirement.
 */
function jumpToFromChip(chip: HTMLElement, view: EditorView): boolean {
  const raw = chip.getAttribute('data-chip-jump-from');
  if (raw === null) return false;
  const jumpTo = Number.parseInt(raw, 10);
  if (!Number.isFinite(jumpTo)) return false;
  view.dispatch({
    selection: EditorSelection.cursor(Math.min(jumpTo, view.state.doc.length)),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

const clickHandler = ViewPlugin.define((view) => {
  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest('[data-chip-jump-from]');
    if (!(chip instanceof HTMLElement)) return;
    if (jumpToFromChip(chip, view)) event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest('[data-chip-jump-from]');
    if (!(chip instanceof HTMLElement)) return;
    if (jumpToFromChip(chip, view)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  view.contentDOM.addEventListener('click', onClick);
  view.contentDOM.addEventListener('keydown', onKeyDown);
  return {
    destroy: () => {
      view.contentDOM.removeEventListener('click', onClick);
      view.contentDOM.removeEventListener('keydown', onKeyDown);
    },
  };
});

const theme = EditorView.baseTheme({
  '.cm-dsl-chip': {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 6px',
    margin: '0 1px',
    borderRadius: '999px',
    fontSize: '0.85em',
    border: '1px solid var(--cm-dsl-chip-border, #d4d4d8)',
    background: 'var(--cm-dsl-chip-bg, #f4f4f5)',
    color: 'var(--cm-dsl-chip-fg, #18181b)',
  },
  '.cm-dsl-chip--ref-index': { background: 'var(--cm-dsl-chip-bg-ref, #e0f2fe)' },
  '.cm-dsl-chip--ref-slug': { background: 'var(--cm-dsl-chip-bg-slug, #ecfdf5)' },
  '.cm-dsl-chip--time': { background: 'var(--cm-dsl-chip-bg-time, #fef3c7)' },
  '.cm-dsl-chip--temperature': { background: 'var(--cm-dsl-chip-bg-temp, #fee2e2)' },
  '.cm-dsl-chip--error': {
    background: 'var(--cm-dsl-chip-bg-error, #fecaca)',
    color: 'var(--cm-dsl-chip-fg-error, #7f1d1d)',
  },
  '.cm-dsl-chip--inline': {
    padding: '0 2px',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    textDecoration: 'underline dotted',
  },
  '.cm-dsl-chip--jump': { cursor: 'pointer' },
  '.cm-dsl-chip--jump:focus-visible': {
    outline: '2px solid var(--cm-dsl-chip-focus, #2563eb)',
    outlineOffset: '1px',
  },
});

export function chipWidgetsExtension(options: ChipWidgetsOptions = {}) {
  const compact = options.compact === true;
  const field = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, compact),
    update(value, tr) {
      if (tr.docChanged) return buildDecorations(tr.state, compact);
      return value.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return [field, clickHandler, theme];
}

export type { Chip, ChipScanResult, IngredientDeclaration } from './chip-scanner-types';
