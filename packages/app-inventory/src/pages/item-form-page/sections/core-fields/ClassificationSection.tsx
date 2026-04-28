import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CheckboxInput, Select } from '@pops/ui';

import { LocationPicker } from '../../../../components/LocationPicker';
import { type ItemFormValues } from '../../useItemFormPageModel';
import { FormField } from './FormField';

import type {
  Control,
  FieldErrors,
  FieldPath,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';

import type { LocationTreeNode } from '../../../location-tree-page/utils';

const ITEM_TYPES = [
  'Electronics',
  'Furniture',
  'Appliance',
  'Clothing',
  'Tools',
  'Sports',
  'Kitchen',
  'Office',
  'Other',
];
const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'broken', label: 'Broken' },
];

/**
 * Restricts the field path to only those whose value type is a boolean. The
 * underlying Radix CheckboxInput uses `checked` / `onCheckedChange`, which is
 * incompatible with RHF's `register()` spread, so we wire boolean fields via
 * Controller (#2175).
 */
type BooleanFieldPath = {
  [K in FieldPath<ItemFormValues>]: ItemFormValues[K] extends boolean ? K : never;
}[FieldPath<ItemFormValues>];

interface BooleanCheckboxProps {
  name: BooleanFieldPath;
  control: Control<ItemFormValues>;
  label: string;
}

/**
 * Adapter that bridges RHF's controller `field` API to Radix's checkbox
 * `checked` / `onCheckedChange` API. The `CheckboxInput` wrapper types
 * `onCheckedChange` as `(checked: boolean) => void`, so the value lands as a
 * plain boolean — no indeterminate coercion needed here.
 */
function BooleanCheckbox({ name, control, label }: BooleanCheckboxProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <CheckboxInput label={label} checked={field.value} onCheckedChange={field.onChange} />
      )}
    />
  );
}

interface ClassificationSectionProps {
  register: UseFormRegister<ItemFormValues>;
  control: Control<ItemFormValues>;
  watch: UseFormWatch<ItemFormValues>;
  setValue: UseFormSetValue<ItemFormValues>;
  errors: FieldErrors<ItemFormValues>;
  locationTree: LocationTreeNode[];
  onCreateLocation: (name: string, parentId: string | null) => void;
}

export function ClassificationSection({
  register,
  control,
  watch,
  setValue,
  errors,
  locationTree,
  onCreateLocation,
}: ClassificationSectionProps) {
  const { t } = useTranslation('inventory');
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
        Classification
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={t('form.typeRequired')} error={errors.type?.message}>
          <Select
            {...register('type', { required: t('form.typeRequired') })}
            options={[
              { value: '', label: t('form.selectType') },
              ...ITEM_TYPES.map((t) => ({ value: t, label: t })),
            ]}
          />
        </FormField>
        <FormField label={t('detail.conditionLabel')}>
          <Select
            {...register('condition')}
            options={[{ value: '', label: t('form.selectCondition') }, ...CONDITIONS]}
          />
        </FormField>
      </div>
      <FormField label={t('form.locationLabel')}>
        <LocationPicker
          locations={locationTree}
          value={watch('locationId') || null}
          onChange={(id) => setValue('locationId', id ?? '', { shouldDirty: true })}
          onCreateLocation={onCreateLocation}
          placeholder={t('form.selectLocation')}
        />
      </FormField>
      <div className="flex gap-6 p-4 rounded-xl bg-app-accent/5">
        <BooleanCheckbox name="inUse" control={control} label={t('form.inUseLabel')} />
        <BooleanCheckbox name="deductible" control={control} label={t('form.taxDeductible')} />
      </div>
    </section>
  );
}
