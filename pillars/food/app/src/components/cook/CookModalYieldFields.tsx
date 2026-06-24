import { useTranslation } from 'react-i18next';

import { Input, Label } from '@pops/ui';

/**
 * Yield qty + unit + location + expires fields for `CookModal`.
 *
 * Hidden when the recipe's version has no `yield_ingredient_id`; the
 * parent only mounts this component for yielding recipes.
 */
import type { ChangeEvent, Dispatch, ReactElement, SetStateAction } from 'react';

import type { CookFormState } from './cook-modal-helpers.js';

type Location = 'pantry' | 'fridge' | 'freezer' | 'other';

const LOCATIONS: readonly Location[] = ['pantry', 'fridge', 'freezer', 'other'];

interface Props {
  form: CookFormState;
  setForm: Dispatch<SetStateAction<CookFormState>>;
  onLocationChange: (location: Location) => void;
}

export function CookModalYieldFields({ form, setForm, onLocationChange }: Props): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="cook-yield-qty">{t('cook.modal.fields.yieldQty')}</Label>
        <Input
          id="cook-yield-qty"
          inputMode="decimal"
          value={form.yieldQty}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setForm((prev) => ({ ...prev, yieldQty: e.target.value, dirty: true }))
          }
        />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t('cook.modal.fields.location')}</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {LOCATIONS.map((loc) => (
            <button
              key={loc}
              type="button"
              role="radio"
              aria-checked={form.location === loc}
              className="cursor-pointer rounded border px-3 py-1 text-sm hover:bg-muted aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground"
              onClick={() => onLocationChange(loc)}
            >
              {t(`cook.modal.location.${loc}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor="cook-expires">{t('cook.modal.fields.expires')}</Label>
        <Input
          id="cook-expires"
          type="date"
          value={form.expiresAt}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setForm((prev) => ({
              ...prev,
              expiresAt: e.target.value,
              dirty: true,
              expiresAtDirty: true,
            }))
          }
        />
      </div>
    </div>
  );
}
