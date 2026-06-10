import { type TFunction } from 'i18next';
/**
 * Generate + Cancel callbacks for the FromPlanPage — extracted so the
 * page component stays under the per-function lint cap.
 */
import { useCallback } from 'react';
import { type NavigateFunction } from 'react-router';

import { GENERATE_ERROR_I18N_KEYS } from './from-plan-helpers.js';

import type { GenerateFromPlanResult } from './types.js';

export interface UseGenerateActionArgs {
  startDate: string;
  endDate: string;
  listName: string;
  setGenerateError: (next: string | null) => void;
  navigate: NavigateFunction;
  t: TFunction<'food'>;
  generateMutation: {
    mutateAsync: (input: {
      startDate: string;
      endDate: string;
      listName: string;
    }) => Promise<GenerateFromPlanResult>;
  };
}

export function useGenerateAction(args: UseGenerateActionArgs): {
  onGenerate: () => Promise<void>;
  onCancel: () => void;
} {
  const { startDate, endDate, listName, setGenerateError, navigate, t, generateMutation } = args;
  const onGenerate = useCallback(async (): Promise<void> => {
    setGenerateError(null);
    const result = await generateMutation.mutateAsync({
      startDate,
      endDate,
      listName: listName.trim(),
    });
    if (result.ok) {
      void navigate(`/lists/${String(result.listId)}`);
      return;
    }
    setGenerateError(t(GENERATE_ERROR_I18N_KEYS[result.reason]));
  }, [generateMutation, startDate, endDate, listName, navigate, t, setGenerateError]);
  const onCancel = useCallback(() => {
    void navigate('/food/plan');
  }, [navigate]);
  return { onGenerate, onCancel };
}
