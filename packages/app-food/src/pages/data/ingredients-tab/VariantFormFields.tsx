/**
 * Field rows for `VariantFormDialog`. Lifted into a sibling component so
 * the dialog body stays under the lint per-function cap.
 */
import { useTranslation } from 'react-i18next';

import { Label } from '@pops/ui';

import { SelectRow, TextFieldRow } from './IngredientFormFields';
import { UNITS, type Unit, type VariantFormState } from './variant-form-helpers';

interface Props {
  mode: 'create' | 'edit';
  form: VariantFormState;
  onChange: (next: VariantFormState) => void;
}

export function VariantFormFields({ mode, form, onChange }: Props) {
  const { t } = useTranslation('food');
  return (
    <>
      <TextFieldRow
        id="variant-slug"
        labelKey="data.ingredients.variants.form.slug"
        value={form.slug}
        placeholder="raw"
        autoFocus={mode === 'create'}
        onChange={(slug) => onChange({ ...form, slug })}
      />
      <TextFieldRow
        id="variant-name"
        labelKey="data.ingredients.variants.form.name"
        value={form.name}
        placeholder="Raw"
        onChange={(name) => onChange({ ...form, name })}
      />
      <SelectRow
        id="variant-unit"
        labelKey="data.ingredients.variants.form.defaultUnit"
        value={form.defaultUnit}
        options={UNITS.map((u) => ({ value: u, label: u }))}
        onChange={(unit) => onChange({ ...form, defaultUnit: unit as Unit })}
      />
      <NumericRow
        id="variant-package"
        labelKey="data.ingredients.variants.form.packageSizeG"
        value={form.packageSizeG}
        precision="decimal"
        onChange={(packageSizeG) => onChange({ ...form, packageSizeG })}
      />
      <NumericRow
        id="variant-shelf-fridge"
        labelKey="data.ingredients.variants.form.shelfLifeFridge"
        value={form.shelfLifeFridge}
        precision="integer"
        onChange={(shelfLifeFridge) => onChange({ ...form, shelfLifeFridge })}
      />
      <NumericRow
        id="variant-shelf-freezer"
        labelKey="data.ingredients.variants.form.shelfLifeFreezer"
        value={form.shelfLifeFreezer}
        precision="integer"
        onChange={(shelfLifeFreezer) => onChange({ ...form, shelfLifeFreezer })}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="variant-notes">{t('data.ingredients.variants.form.notes')}</Label>
        <textarea
          id="variant-notes"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          rows={2}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </div>
    </>
  );
}

function NumericRow({
  id,
  labelKey,
  value,
  precision,
  onChange,
}: {
  id: string;
  labelKey: string;
  value: string;
  precision: 'integer' | 'decimal';
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  const isInteger = precision === 'integer';
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <input
        id={id}
        type="number"
        inputMode={isInteger ? 'numeric' : 'decimal'}
        min={0}
        step={isInteger ? 1 : 'any'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      />
    </div>
  );
}
