import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { IngredientChip } from './IngredientChip';
import { parseStructuralAnchor } from './RecipeRenderer.helpers';
import { TempBadge } from './TempBadge';
import { TimerButton } from './TimerButton';

import type { ComponentProps } from 'react';

import type { ResolvedStepBody, ResolvedStepBodyPart } from '../dsl/resolver-types';
import type { RecipeLineWithResolved } from './RecipeRenderer.types';

/**
 * Render a compiled step body — PRD-121's two-pass markdown approach.
 *
 * 1. `body_md` (PRD-116) is markdown with structural refs already rewritten
 *    as anchor links (`[name](#line-3)`, `[2 min](#timer)`, ...). It is the
 *    text + emphasis source of truth.
 * 2. `body_resolved_json` (also PRD-116) is the typed `ResolvedStepBody`
 *    array: text segments plus `ref` / `time` / `temperature` parts. The
 *    structured parts carry the data the chips / timers / temps need
 *    (ingredient id, duration value, temp unit).
 *
 * As we encounter each anchor in the rendered markdown we pop the next
 * matching part from `body_resolved_json`. Counts must agree (the compile
 * pipeline guarantees this); if they don't, we degrade to a plain link so
 * the body is still readable.
 *
 * Unresolved index refs (`ref.ingredientIndex !== null` with no matching
 * `lines[].position`) render the chip with a destructive error badge per
 * PRD edge-case "Step body with an unresolved `@N`".
 */
export interface RecipeStepBodyProps {
  bodyMd: string;
  bodyResolved: ResolvedStepBody;
  lines: RecipeLineWithResolved[];
  /** Step's `position` — passed to `onTimerStart` so callers know which step fired. */
  stepPosition: number;
  /** Forwarded to inline `<TimerButton>` widgets. */
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void;
}

type StructuralPart = Exclude<ResolvedStepBodyPart, { kind: 'text' }>;

interface Cursor {
  parts: StructuralPart[];
  index: number;
}

function nextStructural(cursor: Cursor): StructuralPart | null {
  const part = cursor.parts[cursor.index];
  if (part === undefined) return null;
  cursor.index += 1;
  return part;
}

function lineByPosition(
  lines: RecipeLineWithResolved[],
  position: number
): RecipeLineWithResolved | undefined {
  return lines.find((l) => l.position === position);
}

export function RecipeStepBody({
  bodyMd,
  bodyResolved,
  lines,
  stepPosition,
  onTimerStart,
}: RecipeStepBodyProps) {
  // One cursor per render — markdown anchor links are walked in document
  // order, and the resolved structural parts are stored in the same order
  // by the compile pipeline.
  const cursor: Cursor = {
    parts: bodyResolved.filter((p): p is StructuralPart => p.kind !== 'text'),
    index: 0,
  };

  const components: ComponentProps<typeof Markdown>['components'] = {
    a: ({ href, children }) => {
      const anchor = parseStructuralAnchor(href);
      if (!anchor) {
        return <a href={href}>{children}</a>;
      }
      const part = nextStructural(cursor);
      // Defensive: the markdown anchor count must match the resolved parts
      // count. If they diverge, fall back to a plain link so the body
      // stays readable even when something upstream drifted.
      if (!part || part.kind !== mappedKindForAnchor(anchor)) {
        return <a href={href}>{children}</a>;
      }
      const label = childrenToText(children);
      return renderStructuralPart({
        anchor,
        part,
        label,
        lines,
        stepPosition,
        onTimerStart,
      });
    },
    img: () => null,
  };

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="step-body">
      <Markdown components={components} rehypePlugins={[rehypeSanitize]}>
        {bodyMd}
      </Markdown>
    </div>
  );
}

function mappedKindForAnchor(anchor: ReturnType<typeof parseStructuralAnchor>) {
  if (!anchor) return null;
  if (anchor.kind === 'timer') return 'time';
  if (anchor.kind === 'temperature') return 'temperature';
  return 'ref';
}

interface RenderPartArgs {
  anchor: NonNullable<ReturnType<typeof parseStructuralAnchor>>;
  part: StructuralPart;
  label: string;
  lines: RecipeLineWithResolved[];
  stepPosition: number;
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void;
}

function renderStructuralPart(args: RenderPartArgs) {
  const { anchor, part, label } = args;
  if (anchor.kind === 'timer' && part.kind === 'time') return renderTimer(args);
  if (anchor.kind === 'temperature' && part.kind === 'temperature') return renderTemp(part);
  if ((anchor.kind === 'lineRef' || anchor.kind === 'slugRef') && part.kind === 'ref') {
    return renderRefChip(args);
  }
  return <span>{label}</span>;
}

function renderTimer({ part, stepPosition, onTimerStart }: RenderPartArgs) {
  if (part.kind !== 'time') return null;
  return (
    <TimerButton
      qty={part.qty.qty}
      unit={part.qty.unit}
      durationMinutes={normaliseToMinutes(part.qty.qty, part.qty.unit)}
      stepPosition={stepPosition}
      onStart={onTimerStart}
    />
  );
}

function renderTemp(part: StructuralPart) {
  if (part.kind !== 'temperature') return null;
  const raw = part.qty.unit;
  const unit: 'c' | 'f' | 'gas' = raw === 'c' || raw === 'f' || raw === 'gas' ? raw : 'c';
  return <TempBadge value={part.qty.qty} unit={unit} />;
}

function renderRefChip({ anchor, label, lines }: RenderPartArgs) {
  const lineAnchor = anchor.kind === 'lineRef' ? anchor.index : null;
  const ingredientAnchor = anchor.kind === 'slugRef' ? anchor.slug : null;
  const line = lineAnchor !== null ? lineByPosition(lines, lineAnchor) : undefined;
  const hasError = lineAnchor !== null && line === undefined;
  return (
    <IngredientChip
      label={label}
      lineAnchor={lineAnchor}
      ingredientAnchor={ingredientAnchor}
      hasError={hasError}
      title={line?.ingredientName ?? label}
    />
  );
}

function normaliseToMinutes(qty: number, unit: string): number {
  switch (unit) {
    case 'h':
    case 'hr':
    case 'hour':
      return qty * 60;
    case 's':
    case 'sec':
      return Math.round(qty / 60);
    default:
      return qty;
  }
}

/**
 * react-markdown's `a` renderer receives children as React nodes (text,
 * possibly nested emphasis). Flatten to a string so we can pass it to the
 * chip / fallback link. Anything non-text (rare in our compiled body)
 * round-trips as empty.
 */
function childrenToText(children: unknown): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    const props = (children as { props?: { children?: unknown } }).props;
    return childrenToText(props?.children);
  }
  return '';
}
