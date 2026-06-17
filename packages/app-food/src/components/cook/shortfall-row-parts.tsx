import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { formatQty } from './cook-format.js';

/**
 * PRD-146 — sub-components for `ShortfallRow`: the radio fieldset, the
 * partial-qty editor, and the row header. Split out to keep the parent
 * row under the per-function line cap.
 */
import type { ReactNode } from 'react';

import type { LineResolution, LineShortfall } from './cook-resolution-types.js';

type Kind = LineResolution['kind'];

interface RadioOptionProps {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
}

export function RadioOption(props: RadioOptionProps): ReactNode {
  return (
    <label className="flex items-center gap-2">
      <input
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.checked}
        onChange={() => props.onSelect()}
      />
      <span>{props.label}</span>
    </label>
  );
}

interface ResolutionRadiosProps {
  shortfall: LineShortfall;
  currentKind: Kind | undefined;
  onSelect: (kind: Kind) => void;
}

export function ResolutionRadios(props: ResolutionRadiosProps): ReactNode {
  const { shortfall, currentKind, onSelect } = props;
  const { t } = useTranslation('food');
  const name = `shortfall-${shortfall.lineIndex}`;
  return (
    <fieldset className="space-y-1 text-sm">
      <RadioOption
        name={name}
        value="batch-override"
        label={t('cook.shortfalls.option.batchOverride')}
        checked={currentKind === 'batch-override'}
        onSelect={() => onSelect('batch-override')}
      />
      <RadioOption
        name={name}
        value="external"
        label={t('cook.shortfalls.option.external')}
        checked={currentKind === 'external'}
        onSelect={() => onSelect('external')}
      />
      {shortfall.available > 0 ? (
        <RadioOption
          name={name}
          value="partial"
          label={t('cook.shortfalls.option.partial')}
          checked={currentKind === 'partial'}
          onSelect={() => onSelect('partial')}
        />
      ) : null}
    </fieldset>
  );
}

interface RowHeaderProps {
  shortfall: LineShortfall;
  unit: string;
}

export function RowHeader(props: RowHeaderProps): ReactNode {
  const { shortfall, unit } = props;
  const { t } = useTranslation('food');
  return (
    <div className="flex justify-between text-sm">
      <span className="font-medium">
        {shortfall.ingredientName}
        {shortfall.variantName === '' ? '' : ` · ${shortfall.variantName}`}
      </span>
      <span className="text-muted-foreground">
        {t('cook.shortfalls.row.needed', { qty: formatQty(shortfall.needed), unit })} ·{' '}
        {t('cook.shortfalls.row.available', { qty: formatQty(shortfall.available), unit })}
      </span>
    </div>
  );
}

interface PartialQtyEditorProps {
  resolution: Extract<LineResolution, { kind: 'partial' }>;
  unit: string;
  onChange: (next: LineResolution) => void;
}

export function PartialQtyEditor(props: PartialQtyEditorProps): ReactNode {
  const { t } = useTranslation('food');
  const { resolution, unit, onChange } = props;
  return (
    <div className="flex gap-2 items-end text-sm">
      <PartialField
        label={`${t('cook.shortfalls.partial.batchQty')}${unit}`}
        testId="partial-batch-qty"
        value={resolution.consumeQty}
        onChange={(n) => onChange({ ...resolution, consumeQty: n })}
      />
      <PartialField
        label={`${t('cook.shortfalls.partial.externalQty')}${unit}`}
        testId="partial-external-qty"
        value={resolution.externalQty}
        onChange={(n) => onChange({ ...resolution, externalQty: n })}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ kind: 'external' })}
      >
        {t('cook.shortfalls.option.external')}
      </Button>
    </div>
  );
}

interface PartialFieldProps {
  label: string;
  testId: string;
  value: number;
  onChange: (next: number) => void;
}

function PartialField(props: PartialFieldProps): ReactNode {
  return (
    <label className="flex flex-col">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        type="number"
        min={0}
        step="any"
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="border rounded px-2 py-1 w-24"
        data-testid={props.testId}
      />
    </label>
  );
}
