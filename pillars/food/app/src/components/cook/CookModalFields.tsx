import { useTranslation } from 'react-i18next';

import { Input, Label, Textarea } from '@pops/ui';

/**
 * Scale + rating + notes fields for `CookModal`.
 */
import type { ChangeEvent, Dispatch, ReactElement, SetStateAction } from 'react';

import type { CookFormState } from './cook-modal-helpers.js';

interface Props {
  form: CookFormState;
  setForm: Dispatch<SetStateAction<CookFormState>>;
}

export function CookModalFields({ form, setForm }: Props): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="cook-scale">{t('cook.modal.fields.scale')}</Label>
        <Input
          id="cook-scale"
          inputMode="decimal"
          value={form.scaleFactor}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setForm((prev) => ({ ...prev, scaleFactor: e.target.value, dirty: true }))
          }
        />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t('cook.modal.fields.rating')}</legend>
        <RatingPicker
          value={form.rating}
          onChange={(v) => setForm((prev) => ({ ...prev, rating: v, dirty: true }))}
        />
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor="cook-notes">{t('cook.modal.fields.notes')}</Label>
        <Textarea
          id="cook-notes"
          value={form.notes}
          maxLength={1000}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setForm((prev) => ({ ...prev, notes: e.target.value, dirty: true }))
          }
        />
      </div>
    </div>
  );
}

function RatingPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div role="radiogroup" aria-label={t('cook.modal.fields.rating')} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          className="cursor-pointer rounded px-2 py-1 text-sm hover:bg-muted aria-checked:bg-primary aria-checked:text-primary-foreground"
          onClick={() => onChange(value === n ? null : n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
