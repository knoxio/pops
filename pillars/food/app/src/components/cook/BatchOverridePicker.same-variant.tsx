/**
 * PRD-149 — Same-variant section of `BatchOverridePicker`.
 *
 * Behaviour unchanged from PRD-146 — only relocated so the parent
 * picker stays under the per-file lint cap with the new Substitutions
 * section sitting alongside it.
 */
import { useTranslation } from 'react-i18next';

import { formatExpiryDate, formatQty, formatUnit } from './cook-format.js';

import type { ReactNode } from 'react';

import type { BatchForConsumeRow } from './cook-resolution-types.js';

export interface SameVariantSectionProps {
  batches: readonly BatchForConsumeRow[];
  onSelect: (batch: BatchForConsumeRow) => void;
}

export function SameVariantSection(props: SameVariantSectionProps): ReactNode {
  const { t } = useTranslation('food');
  return (
    <section data-testid="picker-section-same-variant">
      <h5 className="text-xs font-semibold uppercase text-muted-foreground sticky top-0 bg-card py-1">
        {t('cook.batchPicker.section.sameVariant', { count: props.batches.length })}
      </h5>
      {props.batches.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="batch-picker-empty">
          {t('cook.batchPicker.empty')}
        </p>
      ) : (
        <ul className="border rounded divide-y max-h-60 overflow-y-auto">
          {props.batches.map((batch) => (
            <li key={batch.id}>
              <BatchListRow batch={batch} onSelect={props.onSelect} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface BatchListRowProps {
  batch: BatchForConsumeRow;
  onSelect: (batch: BatchForConsumeRow) => void;
}

function BatchListRow(props: BatchListRowProps): ReactNode {
  const { t } = useTranslation('food');
  const { batch, onSelect } = props;
  const expiry =
    batch.expiresAt === null
      ? t('cook.batchPicker.row.noExpiry')
      : t('cook.batchPicker.row.expires', { date: formatExpiryDate(batch.expiresAt) });
  return (
    <button
      type="button"
      onClick={() => onSelect(batch)}
      className="w-full text-left p-2 hover:bg-accent text-sm"
      data-testid={`batch-picker-row-${batch.id}`}
    >
      <div className="font-medium">
        #{batch.id} · {batch.ingredientName} · {batch.variantName}
        {batch.prepStateLabel === null ? '' : ` · ${batch.prepStateLabel}`}
      </div>
      <div className="text-xs text-muted-foreground">
        {t('cook.batchPicker.row.qty', {
          qty: formatQty(batch.qtyRemaining),
          unit: formatUnit(batch.unit),
        })}{' '}
        · {expiry}
      </div>
    </button>
  );
}
