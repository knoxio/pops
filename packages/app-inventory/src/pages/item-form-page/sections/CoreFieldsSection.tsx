import { type ItemFormValues } from '../useItemFormPageModel';
import { BasicInfoSection } from './core-fields/BasicInfoSection';
import { ClassificationSection } from './core-fields/ClassificationSection';
import { DatesAndValuesSection } from './core-fields/DatesAndValuesSection';

import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import type { LocationTreeNode } from '../../location-tree-page/utils';

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
  register,
  watch,
  setValue,
  errors,
  assetIdError,
  assetIdChecking,
  generating,
  locationTree,
  onAutoGenerate,
  onValidateAssetId,
  onCreateLocation,
}: CoreFieldsSectionProps) {
  const typeValue = watch('type');
  return (
    <>
      <BasicInfoSection
        register={register}
        errors={errors}
        assetIdError={assetIdError}
        assetIdChecking={assetIdChecking}
        generating={generating}
        typeValue={typeValue}
        onAutoGenerate={onAutoGenerate}
        onValidateAssetId={onValidateAssetId}
      />
      <ClassificationSection
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        locationTree={locationTree}
        onCreateLocation={onCreateLocation}
      />
      <DatesAndValuesSection register={register} />
    </>
  );
}
