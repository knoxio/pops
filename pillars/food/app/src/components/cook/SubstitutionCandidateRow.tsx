/**
 * One (substitution edge × batch) candidate row inside the
 * `BatchOverridePicker` Substitutions section. Rendered for each batch
 * under a sub candidate; "no batches" rows render the edge itself with
 * a disabled state so the user can see which subs exist but aren't
 * pickable.
 */
import { useTranslation } from 'react-i18next';

import { formatExpiryDate, formatQty, formatUnit } from './cook-format.js';

import type { ReactNode } from 'react';

import type { SubCandidate, SubCandidateBatch } from './useSubstitutionResolution.js';

export interface SubstitutionCandidateRowProps {
  candidate: SubCandidate;
  batch: SubCandidateBatch | null;
  linePrepStateId: number | null;
  onSelect: (selection: { candidate: SubCandidate; batch: SubCandidateBatch }) => void;
}

export function SubstitutionCandidateRow(props: SubstitutionCandidateRowProps): ReactNode {
  const { t } = useTranslation('food');
  const { candidate, batch, linePrepStateId, onSelect } = props;
  if (batch === null) {
    return (
      <div
        className="w-full text-left p-2 text-sm opacity-60"
        data-testid={`sub-row-${candidate.substitutionId}-empty`}
      >
        <div className="font-medium">
          <span aria-hidden="true">◆ </span>
          {candidate.substituteIngredientName}
          {candidate.substituteVariantName === '' ? '' : ` · ${candidate.substituteVariantName}`}
        </div>
        <div className="text-xs text-muted-foreground">{t('cook.subPicker.row.noBatches')}</div>
      </div>
    );
  }
  const expiry =
    batch.expiresAt === null
      ? t('cook.batchPicker.row.noExpiry')
      : t('cook.batchPicker.row.expires', { date: formatExpiryDate(batch.expiresAt) });
  const prepMismatch =
    linePrepStateId !== null && batch.prepStateId !== null && batch.prepStateId !== linePrepStateId;
  return (
    <button
      type="button"
      onClick={() => onSelect({ candidate, batch })}
      className="w-full text-left p-2 hover:bg-accent text-sm"
      data-testid={`sub-row-${candidate.substitutionId}-${batch.batchId}`}
    >
      <div className="font-medium">
        <span aria-hidden="true">◆ </span>
        {candidate.substituteIngredientName}
        {candidate.substituteVariantName === '' ? '' : ` · ${candidate.substituteVariantName}`}
        {' · #'}
        {batch.batchId}
      </div>
      <div className="text-xs text-muted-foreground">
        {t('cook.subPicker.row.qty', {
          qty: formatQty(batch.qtyRemaining),
          unit: formatUnit(batch.unit),
        })}{' '}
        · {expiry}
      </div>
      <SubMeta candidate={candidate} prepMismatch={prepMismatch} />
    </button>
  );
}

interface SubMetaProps {
  candidate: SubCandidate;
  prepMismatch: boolean;
}

function SubMeta(props: SubMetaProps): ReactNode {
  const { t } = useTranslation('food');
  const tagsLabel =
    props.candidate.contextTags.length === 0
      ? t('cook.subPicker.row.noTags')
      : props.candidate.contextTags.join(', ');
  return (
    <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
      <span>
        {t('cook.subPicker.row.ratio', { ratio: formatRatio(props.candidate.ratio) })} · {tagsLabel}
      </span>
      {props.prepMismatch ? (
        <span
          className="text-amber-600"
          data-testid={`sub-row-${props.candidate.substitutionId}-prep-warning`}
        >
          {t('cook.subPicker.row.prepMismatch')}
        </span>
      ) : null}
    </div>
  );
}

function formatRatio(ratio: number): string {
  if (Number.isInteger(ratio)) return ratio.toFixed(1);
  return String(Math.round(ratio * 100) / 100);
}
