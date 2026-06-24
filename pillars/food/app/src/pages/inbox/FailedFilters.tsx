/**
 * Filter chip group for the Failed-ingests tab. The error-code chip set is
 * dynamic — `availableErrorCodes` comes from the `inboxFailedErrorCodes`
 * endpoint so newly emitted codes surface without a UI change.
 */
import { type ReactElement } from 'react';

import { Badge, Button } from '@pops/ui';

import {
  INGEST_KINDS,
  SINCE_DAYS_OPTIONS,
  type IngestSourceKind,
  type SinceDays,
} from './inbox-types.js';

export interface FailedFiltersState {
  errorCodes: readonly string[];
  kinds: readonly IngestSourceKind[];
  sinceDays: SinceDays;
}

interface Props {
  value: FailedFiltersState;
  availableErrorCodes: readonly string[];
  onChange: (next: FailedFiltersState) => void;
  onClear: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function toggleArray<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function FailedFilters({
  value,
  availableErrorCodes,
  onChange,
  onClear,
  t,
}: Props): ReactElement {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3" data-testid="failed-filters">
      <ChipRow
        label={t('inbox.failed.filters.errorCode')}
        items={availableErrorCodes}
        selected={value.errorCodes}
        onToggle={(code) => onChange({ ...value, errorCodes: toggleArray(value.errorCodes, code) })}
        labelFor={(code) => code}
      />
      <ChipRow
        label={t('inbox.filters.kind')}
        items={INGEST_KINDS}
        selected={value.kinds}
        onToggle={(kind) => onChange({ ...value, kinds: toggleArray(value.kinds, kind) })}
        labelFor={(kind) => t(`inbox.ingestKind.${kind}`)}
      />
      <SinceDaysRow
        value={value.sinceDays}
        onChange={(s) => onChange({ ...value, sinceDays: s })}
        t={t}
      />
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onClear}>
          {t('inbox.filters.clear')}
        </Button>
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
  if (items.length === 0) return <span className="hidden" data-empty-row={label} />;
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

function SinceDaysRow({
  value,
  onChange,
  t,
}: {
  value: SinceDays;
  onChange: (v: SinceDays) => void;
  t: (key: string) => string;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">
        {t('inbox.filters.sinceDays')}
      </span>
      {SINCE_DAYS_OPTIONS.map((opt) => {
        const isOn = value === opt.value;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={isOn}
            onClick={() => onChange(opt.value)}
            className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Badge variant={isOn ? 'default' : 'outline'}>
              {t(`inbox.filters.sinceDaysOption.${opt.key}`)}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
