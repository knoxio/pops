/**
 * Sub-breakdown expander — PRD-150.
 *
 * For recipes with one sub needed, the breakdown line is inlined into
 * the card so the user sees `soy sauce → tamari` without an extra
 * click. For 2+ subs, the card collapses into a "Show subs" toggle —
 * this component owns the expand state.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

export interface SubBreakdownItem {
  lineIndex: number;
  fromIngredientName: string;
  fromVariantName: string | null;
  candidateSubName: string;
  substitutionId: number;
}

function formatFromLabel(item: SubBreakdownItem): string {
  if (item.fromVariantName === null) return item.fromIngredientName;
  return `${item.fromIngredientName} (${item.fromVariantName})`;
}

interface InlineProps {
  subs: readonly SubBreakdownItem[];
}

export function InlineSingleSub({ subs }: InlineProps): ReactElement | null {
  if (subs.length !== 1) return null;
  const sub = subs[0];
  if (sub === undefined) return null;
  return (
    <span className="text-sm text-muted-foreground">
      {formatFromLabel(sub)} → {sub.candidateSubName}
    </span>
  );
}

export function SubBreakdownExpander({ subs }: InlineProps): ReactElement | null {
  const { t } = useTranslation('food');
  const [open, setOpen] = useState(false);
  if (subs.length < 2) return null;
  return (
    <div className="text-sm">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        {open ? t('solve.card.hideSubs') : t('solve.card.showSubs')}
      </Button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-4">
          {subs.map((sub) => (
            <li key={`${sub.lineIndex}-${sub.substitutionId}`} className="text-muted-foreground">
              {formatFromLabel(sub)} → {sub.candidateSubName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
