import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../inventory-api-helpers.js';
import { itemsCountByAssetPrefix, itemsSearchByAssetId } from '../../inventory-api/index.js';
import { extractPrefix, type ItemFormValues } from './types';

import type { UseFormSetValue } from 'react-hook-form';

interface UseAssetIdValidationArgs {
  id: string | undefined;
  typeValue: string;
  setValue: UseFormSetValue<ItemFormValues>;
}

function useValidateAssetIdUniqueness(
  id: string | undefined,
  setAssetIdError: (v: string | null) => void,
  setAssetIdChecking: (v: boolean) => void
) {
  return useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setAssetIdError(null);
        return;
      }
      setAssetIdChecking(true);
      try {
        const { data: match } = unwrap(
          await itemsSearchByAssetId({ query: { assetId: value.trim() } })
        );
        setAssetIdError(
          match && match.id !== id ? `Asset ID already in use by ${match.itemName}` : null
        );
      } catch {
        setAssetIdError(null);
      } finally {
        setAssetIdChecking(false);
      }
    },
    [id, setAssetIdError, setAssetIdChecking]
  );
}

interface AutoGenerateArgs {
  typeValue: string;
  setValue: UseFormSetValue<ItemFormValues>;
  setAssetIdError: (v: string | null) => void;
  setGenerating: (v: boolean) => void;
  validateAssetIdUniqueness: (value: string) => Promise<void>;
}

function useHandleAutoGenerate(args: AutoGenerateArgs) {
  const { typeValue, setValue, setAssetIdError, setGenerating, validateAssetIdUniqueness } = args;
  return useCallback(async () => {
    if (!typeValue) return;
    setGenerating(true);
    try {
      const prefix = extractPrefix(typeValue);
      const { data: count } = unwrap(await itemsCountByAssetPrefix({ query: { prefix } }));
      const nextNum = count + 1;
      const padded = nextNum >= 100 ? String(nextNum) : String(nextNum).padStart(2, '0');
      const newAssetId = `${prefix}${padded}`;
      setValue('assetId', newAssetId, { shouldDirty: true });
      setAssetIdError(null);
      void validateAssetIdUniqueness(newAssetId);
    } catch {
      toast.error('Failed to generate asset ID');
    } finally {
      setGenerating(false);
    }
  }, [typeValue, setValue, setAssetIdError, setGenerating, validateAssetIdUniqueness]);
}

export function useAssetIdValidation({ id, typeValue, setValue }: UseAssetIdValidationArgs) {
  const [assetIdError, setAssetIdError] = useState<string | null>(null);
  const [assetIdChecking, setAssetIdChecking] = useState(false);
  const [generating, setGenerating] = useState(false);

  const validateAssetIdUniqueness = useValidateAssetIdUniqueness(
    id,
    setAssetIdError,
    setAssetIdChecking
  );
  const handleAutoGenerate = useHandleAutoGenerate({
    typeValue,
    setValue,
    setAssetIdError,
    setGenerating,
    validateAssetIdUniqueness,
  });

  return {
    assetIdError,
    assetIdChecking,
    generating,
    validateAssetIdUniqueness,
    handleAutoGenerate,
  };
}
