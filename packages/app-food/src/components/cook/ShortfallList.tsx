/**
 * `ShortfallList` — PRD-146.
 *
 * Lists every unresolved-need line with three resolution radios. The
 * parent `CookModal` reads `unresolvedShortfallCount` from
 * `useCookResolution` to gate Mark-cooked.
 *
 * Expanded by default; collapsing is allowed but Mark-cooked stays
 * disabled regardless of panel visibility (state is independent).
 */
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ShortfallRow } from './ShortfallRow.js';

import type { ReactNode } from 'react';

import type { LineConsumeNeed, LineResolution, LineShortfall } from './cook-resolution-types.js';

export interface ShortfallListProps {
  shortfalls: readonly LineShortfall[];
  needsByLine: ReadonlyMap<number, LineConsumeNeed>;
  resolutionMap: ReadonlyMap<number, LineResolution>;
  /** PRD-149 — threaded down to the per-row `BatchOverridePicker`. */
  recipeVersionId: number;
  onResolve: (lineIndex: number, resolution: LineResolution) => void;
  scaleResetSignal: number;
}

function unresolvedShortfalls(
  shortfalls: readonly LineShortfall[],
  needsByLine: ReadonlyMap<number, LineConsumeNeed>
): LineShortfall[] {
  const out: LineShortfall[] = [];
  for (const s of shortfalls) {
    const need = needsByLine.get(s.lineIndex);
    if (need?.optional === true) continue;
    if (s.available >= s.needed) continue;
    out.push(s);
  }
  return out;
}

export function ShortfallList(props: ShortfallListProps): ReactNode {
  const { shortfalls, needsByLine, resolutionMap, recipeVersionId, onResolve, scaleResetSignal } =
    props;
  const { t } = useTranslation('food');
  const headingId = useId();
  const [expanded, setExpanded] = useState(true);

  const items = useMemo(
    () => unresolvedShortfalls(shortfalls, needsByLine),
    [shortfalls, needsByLine]
  );

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="border border-amber-500/40 rounded-md"
      data-testid="shortfall-panel"
    >
      <ShortfallHeader
        headingId={headingId}
        expanded={expanded}
        count={items.length}
        title={t('cook.shortfalls.title')}
        summary={t('cook.shortfalls.summary', { count: items.length })}
        onToggle={() => setExpanded((p) => !p)}
      />
      <ScaleResetBanner show={scaleResetSignal > 0} label={t('cook.shortfalls.scaleReset')} />
      {expanded ? (
        <ShortfallItems
          items={items}
          needsByLine={needsByLine}
          resolutionMap={resolutionMap}
          recipeVersionId={recipeVersionId}
          onResolve={onResolve}
        />
      ) : null}
    </section>
  );
}

function ScaleResetBanner({ show, label }: { show: boolean; label: string }): ReactNode {
  if (!show) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="px-3 pb-2 text-xs text-muted-foreground"
      data-testid="scale-reset-banner"
    >
      {label}
    </p>
  );
}

interface ShortfallHeaderProps {
  headingId: string;
  expanded: boolean;
  count: number;
  title: string;
  summary: string;
  onToggle: () => void;
}

function ShortfallHeader(props: ShortfallHeaderProps): ReactNode {
  return (
    <button
      type="button"
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      className="flex w-full items-center justify-between p-3 text-left"
    >
      <h3 id={props.headingId} className="text-sm font-medium">
        {props.title}
      </h3>
      <span className="text-xs text-amber-600">{props.summary}</span>
    </button>
  );
}

interface ShortfallItemsProps {
  items: readonly LineShortfall[];
  needsByLine: ReadonlyMap<number, LineConsumeNeed>;
  resolutionMap: ReadonlyMap<number, LineResolution>;
  recipeVersionId: number;
  onResolve: (lineIndex: number, resolution: LineResolution) => void;
}

function ShortfallItems(props: ShortfallItemsProps): ReactNode {
  return (
    <ul className="border-t divide-y" data-testid="shortfall-list">
      {props.items.map((shortfall) => {
        const need = props.needsByLine.get(shortfall.lineIndex);
        if (need === undefined) return null;
        return (
          <li key={shortfall.lineIndex}>
            <ShortfallRow
              shortfall={shortfall}
              need={need}
              recipeVersionId={props.recipeVersionId}
              resolution={props.resolutionMap.get(shortfall.lineIndex)}
              onResolve={(resolution) => props.onResolve(shortfall.lineIndex, resolution)}
            />
          </li>
        );
      })}
    </ul>
  );
}
