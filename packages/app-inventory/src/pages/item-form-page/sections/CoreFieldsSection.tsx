import { Loader2, Wand2 } from 'lucide-react';
import type { UseFormRegister, UseFormWatch, UseFormSetValue, FieldErrors } from 'react-hook-form';

import {
  Button,
  CheckboxInput,
  DateInput,
  Label,
  Select,
  TextInput,
} from '@pops/ui';

import { LocationPicker } from '../../../components/LocationPicker';
import { extractPrefix, type ItemFormValues } from '../useItemFormPageModel';

import type { LocationTreeNode } from '../../location-tree-page/utils';

const ITEM_TYPES = ['Electronics', 'Furniture', 'Appliance', 'Clothing', 'Tools', 'Sports', 'Kitchen', 'Office', 'Other'];
const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'broken', label: 'Broken' },
];

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}

interface CoreFieldsSectionProps {
  register: UseFormRegister<ItemFormValues>;
  watch: UseFormWatch<ItemFormValues>;
  setValue: UseFormSetValue<ItemFormValues>;
  errors: FieldErrors<ItemFormValues>;
  assetIdError: string | null;
  assetIdChecking: boolean;
  generating: boolean;
  locationTree: LocationTreeNode[];
  onAutoGenerate: () => void;
  onValidateAssetId: (value: string) => void;
  onCreateLocation: (name: string, parentId: string | null) => void;
}

export function CoreFieldsSection({
  register, watch, setValue, errors,
  assetIdError, assetIdChecking, generating,
  locationTree, onAutoGenerate, onValidateAssetId, onCreateLocation,
}: CoreFieldsSectionProps) {
  const typeValue = watch('type');

  return (
    <>
      <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
          Basic Information
        </h2>
        <FormField label="Item Name *" error={errors.itemName?.message}>
          <TextInput {...register('itemName', { required: 'Item name is required' })} placeholder="e.g. MacBook Pro 16-inch" className="font-semibold" />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Brand"><TextInput {...register('brand')} placeholder="e.g. Apple" /></FormField>
          <FormField label="Model"><TextInput {...register('model')} placeholder="e.g. M3 Max" /></FormField>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Item ID / SKU"><TextInput {...register('itemId')} /></FormField>
          <FormField label="Asset ID" error={assetIdError ?? undefined}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <TextInput {...register('assetId')} className="font-mono" onBlur={(e) => onValidateAssetId(e.target.value)} />
                {assetIdChecking && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <Button type="button" variant="outline" size="sm" disabled={!typeValue || generating} onClick={onAutoGenerate} className="shrink-0 whitespace-nowrap" title={typeValue ? `Generate ${extractPrefix(typeValue)}XX` : 'Select a type first'}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
                Auto-generate
              </Button>
            </div>
          </FormField>
        </div>
      </section>

      <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
          Classification
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Type *" error={errors.type?.message}>
            <Select {...register('type', { required: 'Type is required' })} options={[{ value: '', label: 'Select type...' }, ...ITEM_TYPES.map((t) => ({ value: t, label: t }))]} />
          </FormField>
          <FormField label="Condition">
            <Select {...register('condition')} options={[{ value: '', label: 'Select condition...' }, ...CONDITIONS]} />
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

      <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
          Dates & Values
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Purchase Date"><DateInput {...register('purchaseDate')} /></FormField>
          <FormField label="Warranty Expires"><DateInput {...register('warrantyExpires')} /></FormField>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Purchase Price ($)">
            <TextInput type="number" step="0.01" min="0" {...register('purchasePrice')} placeholder="0.00" />
          </FormField>
          <FormField label="Replacement Value ($)">
            <TextInput type="number" step="0.01" min="0" {...register('replacementValue')} placeholder="0.00" className="font-bold text-app-accent" />
          </FormField>
          <FormField label="Resale Value ($)">
            <TextInput type="number" step="0.01" min="0" {...register('resaleValue')} placeholder="0.00" />
          </FormField>
        </div>
      </section>
    </>
  );
}
