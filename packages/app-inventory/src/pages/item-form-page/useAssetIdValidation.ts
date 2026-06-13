import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { usePillarCall } from '../../lib/pillar-call';
import { extractPrefix, type ItemFormValues } from './types';

import type { UseFormSetValue } from 'react-hook-form';

interface UseAssetIdValidationArgs {
  id: string | undefined;
  typeValue: string;
  setValue: UseFormSetValue<ItemFormValues>;
}

interface SearchByAssetIdResult {
  data: { id: string; itemName: string } | null;
}

interface CountByAssetPrefixResult {
  data: number;
}

type PillarCall = ReturnType<typeof usePillarCall>;

function useValidateAssetIdUniqueness(
  id: string | undefined,
  pillarCall: PillarCall,
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
        const result = await pillarCall<SearchByAssetIdResult>(
          'inventory',
          ['items', 'searchByAssetId'],
          { assetId: value.trim() }
        );
        if (result.kind !== 'ok') {
          setAssetIdError(null);
          return;
        }
        const match = result.value.data;
        setAssetIdError(
          match && match.id !== id ? `Asset ID already in use by ${match.itemName}` : null
        );
      } catch {
        setAssetIdError(null);
      } finally {
        setAssetIdChecking(false);
      }
    },
    [id, pillarCall, setAssetIdError, setAssetIdChecking]
  );
}

interface AutoGenerateArgs {
  typeValue: string;
  pillarCall: PillarCall;
  setValue: UseFormSetValue<ItemFormValues>;
  setAssetIdError: (v: string | null) => void;
  setGenerating: (v: boolean) => void;
  validateAssetIdUniqueness: (value: string) => Promise<void>;
}

function useHandleAutoGenerate(args: AutoGenerateArgs) {
  const {
    typeValue,
    pillarCall,
    setValue,
    setAssetIdError,
    setGenerating,
    validateAssetIdUniqueness,
  } = args;
  return useCallback(async () => {
    if (!typeValue) return;
    setGenerating(true);
    try {
      const prefix = extractPrefix(typeValue);
      const result = await pillarCall<CountByAssetPrefixResult>(
        'inventory',
        ['items', 'countByAssetPrefix'],
        { prefix }
      );
      if (result.kind !== 'ok') {
        toast.error('Failed to generate asset ID');
        return;
      }
      const nextNum = result.value.data + 1;
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
  }, [typeValue, pillarCall, setValue, setAssetIdError, setGenerating, validateAssetIdUniqueness]);
}

export function useAssetIdValidation({ id, typeValue, setValue }: UseAssetIdValidationArgs) {
  const pillarCall = usePillarCall();
  const [assetIdError, setAssetIdError] = useState<string | null>(null);
  const [assetIdChecking, setAssetIdChecking] = useState(false);
  const [generating, setGenerating] = useState(false);

  const validateAssetIdUniqueness = useValidateAssetIdUniqueness(
    id,
    pillarCall,
    setAssetIdError,
    setAssetIdChecking
  );
  const handleAutoGenerate = useHandleAutoGenerate({
    typeValue,
    pillarCall,
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
