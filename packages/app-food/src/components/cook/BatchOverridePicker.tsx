/**
 * `BatchOverridePicker` — PRD-146.
 *
 * Search/select widget inside `ShortfallRow` for picking a batch.
 * Queries `food.batches.searchForConsume` and surfaces FIFO-ordered
 * batches; defaults to filtering by the line's `ingredientId` so
 * batches of any variant of the same ingredient show up.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';
import { Button } from '@pops/ui';

import { formatQty, formatExpiryDate, formatUnit } from './cook-format.js';

import type { ReactNode } from 'react';

import type { BatchForConsumeRow } from '@pops/app-food-db';

export interface BatchOverridePickerProps {
  ingredientId?: number;
  variantId?: number;
  onSelect: (batch: BatchForConsumeRow) => void;
  onCancel: () => void;
}

function filterBatches(items: readonly BatchForConsumeRow[], search: string): BatchForConsumeRow[] {
  if (search === '') return [...items];
  const needle = search.toLowerCase();
  return items.filter((b) => {
    const haystack = `${b.ingredientName} ${b.variantName} ${b.prepStateLabel ?? ''}`;
    return haystack.toLowerCase().includes(needle);
  });
}

export function BatchOverridePicker(props: BatchOverridePickerProps): ReactNode {
  const { ingredientId, onSelect, onCancel } = props;
  const { t } = useTranslation('food');
  const [search, setSearch] = useState('');

  const query = trpc.food.batches.searchForConsume.useQuery(
    { ingredientId, limit: 20 },
    { enabled: ingredientId !== undefined }
  );

  const filtered = useMemo(
    () => filterBatches(query.data?.items ?? [], search),
    [query.data, search]
  );

  return (
    <div className="border rounded-md p-3 bg-card space-y-2" data-testid="batch-override-picker">
      <header className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{t('cook.batchPicker.title')}</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('cook.batchPicker.cancel')}
        </Button>
      </header>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('cook.batchPicker.search')}
        className="w-full border rounded px-2 py-1 text-sm"
        data-testid="batch-picker-search"
      />
      <BatchList batches={filtered} onSelect={onSelect} />
    </div>
  );
}

interface BatchListProps {
  batches: readonly BatchForConsumeRow[];
  onSelect: (batch: BatchForConsumeRow) => void;
}

function BatchList(props: BatchListProps): ReactNode {
  const { t } = useTranslation('food');
  if (props.batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="batch-picker-empty">
        {t('cook.batchPicker.empty')}
      </p>
    );
  }
  return (
    <ul className="border rounded divide-y max-h-60 overflow-y-auto">
      {props.batches.map((batch) => (
        <li key={batch.id}>
          <BatchListRow batch={batch} onSelect={props.onSelect} />
        </li>
      ))}
    </ul>
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
