/**
 * `WidgetType` subclasses rendered by the chip extension.
 *
 * Each widget produces a small inline DOM element that replaces (or marks)
 * the source range while keeping the document text intact — the user can
 * still cursor through, and copy/paste preserves the raw `@N` / `@slug` /
 * `@time(...)` / `@temperature(...)` source.
 *
 * Click + keyboard activation live outside the widget instances. The
 * chip-widgets extension installs a `ViewPlugin` that attaches `click` and
 * `keydown` listeners directly to `view.contentDOM` (not via
 * `EditorView.domEventHandlers`, whose routing doesn't fire reliably for
 * synthetic events on widget DOM under jsdom). Each handler walks up from
 * the event target, reads `data-chip-jump-from`, and dispatches an
 * `EditorSelection.cursor(...)` transaction. Keeping the dispatch out of
 * the widget means the widget doesn't need to capture the EditorView in
 * its constructor (which would defeat WidgetType reuse).
 */
import { WidgetType } from '@codemirror/view';

export class RefIndexChipWidget extends WidgetType {
  readonly index: number;
  readonly label: string;
  readonly title: string;
  readonly jumpFrom: number | null;
  readonly hasError: boolean;

  constructor(args: {
    index: number;
    label: string;
    title: string;
    jumpFrom: number | null;
    hasError: boolean;
  }) {
    super();
    this.index = args.index;
    this.label = args.label;
    this.title = args.title;
    this.jumpFrom = args.jumpFrom;
    this.hasError = args.hasError;
  }

  eq(other: RefIndexChipWidget): boolean {
    return (
      other.index === this.index &&
      other.label === this.label &&
      other.title === this.title &&
      other.jumpFrom === this.jumpFrom &&
      other.hasError === this.hasError
    );
  }

  toDOM(): HTMLElement {
    return buildChip({
      kind: 'ref-index',
      text: `#${this.index} ${this.label}`,
      title: this.title,
      jumpFrom: this.jumpFrom,
      hasError: this.hasError,
    });
  }
}

export class RefSlugChipWidget extends WidgetType {
  readonly slug: string;
  readonly title: string;
  readonly jumpFrom: number | null;

  constructor(args: { slug: string; title: string; jumpFrom: number | null }) {
    super();
    this.slug = args.slug;
    this.title = args.title;
    this.jumpFrom = args.jumpFrom;
  }

  eq(other: RefSlugChipWidget): boolean {
    return other.slug === this.slug && other.jumpFrom === this.jumpFrom;
  }

  toDOM(): HTMLElement {
    return buildChip({
      kind: 'ref-slug',
      text: this.slug,
      title: this.title,
      jumpFrom: this.jumpFrom,
      hasError: false,
    });
  }
}

export class InlineFuncPillWidget extends WidgetType {
  readonly kind: 'time' | 'temperature';
  readonly label: string;

  constructor(args: { kind: 'time' | 'temperature'; label: string }) {
    super();
    this.kind = args.kind;
    this.label = args.label;
  }

  eq(other: InlineFuncPillWidget): boolean {
    return other.kind === this.kind && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = `cm-dsl-chip cm-dsl-chip--pill cm-dsl-chip--${this.kind}`;
    el.textContent = this.label;
    el.setAttribute('data-chip-kind', this.kind);
    return el;
  }
}

function buildChip(args: {
  kind: 'ref-index' | 'ref-slug';
  text: string;
  title: string;
  jumpFrom: number | null;
  hasError: boolean;
}): HTMLElement {
  const el = document.createElement('span');
  el.className = `cm-dsl-chip cm-dsl-chip--${args.kind}${
    args.hasError ? ' cm-dsl-chip--error' : ''
  }`;
  el.textContent = args.text;
  el.title = args.title;
  el.setAttribute('data-chip-kind', args.kind);
  if (args.jumpFrom !== null) {
    el.setAttribute('data-chip-jump-from', String(args.jumpFrom));
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.classList.add('cm-dsl-chip--jump');
  }
  if (args.hasError) el.setAttribute('data-chip-error', 'true');
  return el;
}
