import { Loader2, Wand2 } from 'lucide-react';

import { Button, TextInput } from '@pops/ui';

import { extractPrefix, type ItemFormValues } from '../../useItemFormPageModel';
import { FormField } from './FormField';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';

interface BasicInfoSectionProps {
  register: UseFormRegister<ItemFormValues>;
  errors: FieldErrors<ItemFormValues>;
  assetIdError: string | null;
  assetIdChecking: boolean;
  generating: boolean;
  typeValue: string;
  onAutoGenerate: () => void;
  onValidateAssetId: (value: string) => void;
}

function AssetIdField({
  register,
  assetIdChecking,
  generating,
  typeValue,
  onAutoGenerate,
  onValidateAssetId,
}: Omit<BasicInfoSectionProps, 'errors' | 'assetIdError'>) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <TextInput
          {...register('assetId')}
          className="font-mono"
          onBlur={(e) => onValidateAssetId(e.target.value)}
        />
        {assetIdChecking && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!typeValue || generating}
        onClick={onAutoGenerate}
        className="shrink-0 whitespace-nowrap"
        title={typeValue ? `Generate ${extractPrefix(typeValue)}XX` : 'Select a type first'}
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4 mr-1" />
        )}
        Auto-generate
      </Button>
    </div>
  );
}

export function BasicInfoSection(props: BasicInfoSectionProps) {
  const { register, errors, assetIdError } = props;
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
        Basic Information
      </h2>
      <FormField label="Item Name *" error={errors.itemName?.message}>
        <TextInput
          {...register('itemName', { required: 'Item name is required' })}
          placeholder="e.g. MacBook Pro 16-inch"
          className="font-semibold"
        />
      </FormField>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Brand">
          <TextInput {...register('brand')} placeholder="e.g. Apple" />
        </FormField>
        <FormField label="Model">
          <TextInput {...register('model')} placeholder="e.g. M3 Max" />
        </FormField>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Item ID / SKU">
          <TextInput {...register('itemId')} />
        </FormField>
        <FormField label="Asset ID" error={assetIdError ?? undefined}>
          <AssetIdField {...props} />
        </FormField>
      </div>
    </section>
  );
}
