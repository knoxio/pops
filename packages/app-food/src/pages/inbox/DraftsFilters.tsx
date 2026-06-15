/**
 * PRD-134 — filter chip group + sort dropdown for the Drafts tab.
 *
 * All chips are multi-select; the band group defaults to all-selected so the
 * triagers see the full queue out of the box. The sort dropdown is
 * single-select with four documented orders. Parent owns the filter object
 * and decides where the state is persisted (this PRD wires it to the URL
 * hash via `drafts-filters.ts`).
 */
import { type ChangeEvent, type ReactElement } from 'react';

import { Badge, Button } from '@pops/ui';

import {
  ALL_BANDS,
  ALL_INGEST_KINDS,
  ALL_PARTIAL_REASONS,
  type DraftsFiltersState,
} from './drafts-filters.js';

import type { DraftSort, IngestSourceKind, QualityBand } from '@pops/app-food-db';
import type { PartialReason } from '@pops/food-contracts';

interface Props {
  value: DraftsFiltersState;
  onChange: (next: DraftsFiltersState) => void;
  onClear: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function toggleArray<T extends string>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function DraftsFilters({ value, onChange, onClear, t }: Props): ReactElement {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3" data-testid="drafts-filters">
      <ChipRow
        label={t('inbox.drafts.filters.band')}
        items={ALL_BANDS}
        selected={value.bands}
        onToggle={(band: QualityBand) =>
          onChange({ ...value, bands: toggleArray(value.bands, band) })
        }
        labelFor={(band) => t(`inbox.drafts.band.${band}`)}
      />
      <ChipRow
        label={t('inbox.filters.kind')}
        items={ALL_INGEST_KINDS}
        selected={value.kinds}
        onToggle={(kind: IngestSourceKind) =>
          onChange({ ...value, kinds: toggleArray(value.kinds, kind) })
        }
        labelFor={(kind) => t(`inbox.ingestKind.${kind}`)}
      />
      <ChipRow
        label={t('inbox.drafts.filters.partialReason')}
        items={ALL_PARTIAL_REASONS}
        selected={value.partialReasons}
        onToggle={(reason: PartialReason) =>
          onChange({ ...value, partialReasons: toggleArray(value.partialReasons, reason) })
        }
        labelFor={(reason) => t(`inbox.drafts.partialReason.${reason}`)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.freshOnly}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...value, freshOnly: e.target.checked })
            }
            data-testid="drafts-freshonly"
          />
          {t('inbox.drafts.filters.freshOnly')}
        </label>
        <SortDropdown value={value.sort} onChange={(sort) => onChange({ ...value, sort })} t={t} />
        <div className="ml-auto">
          <Button size="sm" variant="ghost" onClick={onClear}>
            {t('inbox.filters.clear')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ChipRowProps<T extends string> {
  label: string;
  items: readonly T[];
  selected: readonly T[];
  onToggle: (item: T) => void;
  labelFor: (item: T) => string;
}

function ChipRow<T extends string>({
  label,
  items,
  selected,
  onToggle,
  labelFor,
}: ChipRowProps<T>): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {items.map((item) => {
        const isOn = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            aria-pressed={isOn}
            onClick={() => onToggle(item)}
            className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Badge variant={isOn ? 'default' : 'outline'}>{labelFor(item)}</Badge>
          </button>
        );
      })}
    </div>
  );
}

const SORT_OPTIONS: readonly DraftSort[] = ['quality-asc', 'quality-desc', 'oldest', 'newest'];

function SortDropdown({
  value,
  onChange,
  t,
}: {
  value: DraftSort;
  onChange: (sort: DraftSort) => void;
  t: (key: string) => string;
}): ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-muted-foreground">{t('inbox.drafts.filters.sort')}</span>
      <select
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as DraftSort)}
        className="rounded-md border bg-background px-2 py-1 text-sm"
        data-testid="drafts-sort"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {t(`inbox.drafts.sort.${opt}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
