import { CheckboxInput, Select } from '@pops/ui';

import { LocationPicker } from '../../../../components/LocationPicker';
import { type ItemFormValues } from '../../useItemFormPageModel';
import { FormField } from './FormField';

import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';

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

interface ClassificationSectionProps {
  register: UseFormRegister<ItemFormValues>;
  watch: UseFormWatch<ItemFormValues>;
  setValue: UseFormSetValue<ItemFormValues>;
  errors: FieldErrors<ItemFormValues>;
  locationTree: LocationTreeNode[];
  onCreateLocation: (name: string, parentId: string | null) => void;
}

export function ClassificationSection({
  register,
  watch,
  setValue,
  errors,
  locationTree,
  onCreateLocation,
}: ClassificationSectionProps) {
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
        Classification
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Type *" error={errors.type?.message}>
          <Select
            {...register('type', { required: 'Type is required' })}
            options={[
              { value: '', label: 'Select type...' },
              ...ITEM_TYPES.map((t) => ({ value: t, label: t })),
            ]}
          />
        </FormField>
        <FormField label="Condition">
          <Select
            {...register('condition')}
            options={[{ value: '', label: 'Select condition...' }, ...CONDITIONS]}
          />
        </FormField>
      </div>
      <FormField label="Location">
        <LocationPicker
          locations={locationTree}
          value={watch('locationId') || null}
          onChange={(id) => setValue('locationId', id ?? '', { shouldDirty: true })}
          onCreateLocation={onCreateLocation}
          placeholder="Select location…"
        />
      </FormField>
      <div className="flex gap-6 p-4 rounded-xl bg-app-accent/5">
        <CheckboxInput label="In Use" {...register('inUse')} />
        <CheckboxInput label="Tax Deductible" {...register('deductible')} />
      </div>
    </section>
  );
}
