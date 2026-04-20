import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { extractPrefix, type ItemFormValues } from './types';

import type { UseFormSetValue } from 'react-hook-form';

interface UseAssetIdValidationArgs {
  id: string | undefined;
  typeValue: string;
  setValue: UseFormSetValue<ItemFormValues>;
}

export function useAssetIdValidation({ id, typeValue, setValue }: UseAssetIdValidationArgs) {
  const utils = trpc.useUtils();
  const [assetIdError, setAssetIdError] = useState<string | null>(null);
  const [assetIdChecking, setAssetIdChecking] = useState(false);
  const [generating, setGenerating] = useState(false);

  const validateAssetIdUniqueness = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setAssetIdError(null);
        return;
      }
      setAssetIdChecking(true);
      try {
        const result = await utils.inventory.items.searchByAssetId.fetch({ assetId: value.trim() });
        if (result.data && result.data.id !== id) {
          setAssetIdError(`Asset ID already in use by ${result.data.itemName}`);
        } else {
          setAssetIdError(null);
        }
      } catch {
        setAssetIdError(null);
      } finally {
        setAssetIdChecking(false);
      }
    },
    [id, utils]
  );

  const handleAutoGenerate = useCallback(async () => {
    if (!typeValue) return;
    setGenerating(true);
    try {
      const prefix = extractPrefix(typeValue);
      const result = await utils.inventory.items.countByAssetPrefix.fetch({ prefix });
      const nextNum = result.data + 1;
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
  }, [typeValue, utils, setValue, validateAssetIdUniqueness]);

  return {
    assetIdError,
    assetIdChecking,
    generating,
    validateAssetIdUniqueness,
    handleAutoGenerate,
  };
}
