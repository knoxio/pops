import { useTranslation } from 'react-i18next';

import { RadioGroup, RadioGroupItem } from '@pops/ui';

import { LIST_KINDS, type ListKind } from './list-index-types.js';

import type { ReactElement } from 'react';

interface Props {
  value: ListKind;
  onChange: (next: ListKind) => void;
  /** id prefix so multiple instances on the same page don't collide. */
  idPrefix?: string;
  /** Disable while a mutation is in flight. */
  disabled?: boolean;
}

/**
 * Kind picker for the New / Edit modals. Lives in `lists-index/` rather
 * than a generic shared folder because PRD-140 part B owns the modal that
 * first consumes it; PRD-140 part C will re-export from here when the edit
 * modal lands.
 */
export function KindRadioGroup({
  value,
  onChange,
  idPrefix = 'list-kind',
  disabled = false,
}: Props): ReactElement {
  const { t } = useTranslation('lists');
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as ListKind)}
      aria-label={t('new.fields.kindLabel')}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {LIST_KINDS.map((kind) => {
        const id = `${idPrefix}-${kind}`;
        return (
          <label
            key={kind}
            htmlFor={id}
            className="flex items-center gap-2 rounded-md border p-3 text-sm font-medium hover:bg-accent/40 has-[input:checked]:border-primary has-[input:checked]:bg-accent/60 has-[input:disabled]:opacity-50"
          >
            <RadioGroupItem id={id} value={kind} disabled={disabled} />
            <span>{t(`index.kinds.${kind}`)}</span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
