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

import type { LineConsumeNeed, LineResolution, LineShortfall } from '@pops/app-food-db';

export interface ShortfallListProps {
  shortfalls: readonly LineShortfall[];
  needsByLine: ReadonlyMap<number, LineConsumeNeed>;
  resolutionMap: ReadonlyMap<number, LineResolution>;
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
  const { shortfalls, needsByLine, resolutionMap, onResolve, scaleResetSignal } = props;
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
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <h3 id={headingId} className="text-sm font-medium">
          {t('cook.shortfalls.title')}
        </h3>
        <span className="text-xs text-amber-600">
          {t('cook.shortfalls.summary', { count: items.length })}
        </span>
      </button>
      {scaleResetSignal > 0 ? (
        <p
          role="status"
          aria-live="polite"
          className="px-3 pb-2 text-xs text-muted-foreground"
          data-testid="scale-reset-banner"
        >
          {t('cook.shortfalls.scaleReset')}
        </p>
      ) : null}
      {expanded ? (
        <ul className="border-t divide-y" data-testid="shortfall-list">
          {items.map((shortfall) => {
            const need = needsByLine.get(shortfall.lineIndex);
            if (need === undefined) return null;
            return (
              <li key={shortfall.lineIndex}>
                <ShortfallRow
                  shortfall={shortfall}
                  need={need}
                  resolution={resolutionMap.get(shortfall.lineIndex)}
                  onResolve={(resolution) => onResolve(shortfall.lineIndex, resolution)}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
