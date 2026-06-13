/**
 * Mutation hook for `food.cook.markCooked` — PRD-144.
 *
 * Owns the result-shape branching (`ok: true` → close + onSuccess; `ok:
 * false` → i18n error surface) and the search-for-consume cache
 * invalidation. PRD-146 reads the same cache when its real
 * `BatchOverridePicker` lands, so any cook must invalidate it.
 *
 * `onSuccess` receives the chosen yield location alongside the run +
 * batch ids so the parent toast can localise the message per location
 * (Copilot R1).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

import type { buildSubmitInput } from './cook-modal-helpers.js';
import type { CookedSuccess } from './CookModal.js';

type MarkCookedInput = inferRouterInputs<AppRouter>['food']['cook']['markCooked'];
type MarkCookedOutput = inferRouterOutputs<AppRouter>['food']['cook']['markCooked'];

interface Args {
  onSuccess?: (result: CookedSuccess) => void;
  onClose: () => void;
}

interface Result {
  submit: (input: ReturnType<typeof buildSubmitInput>) => void;
  isPending: boolean;
  errorMessage: string | null;
}

export function useMarkCookedMutation(args: Args): Result {
  const { t } = useTranslation('food');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const utils = usePillarUtils('food');
  const mutation = usePillarMutation<MarkCookedInput, MarkCookedOutput>(
    'food',
    ['cook', 'markCooked'],
    {
      onSuccess: (result, input) => {
        if (result.ok) {
          setErrorMessage(null);
          void utils.invalidate(['batches', 'searchForConsume']);
          args.onSuccess?.({
            recipeRunId: result.recipeRunId,
            yieldedBatchId: result.yieldedBatchId,
            location: input.yield?.location ?? null,
          });
          args.onClose();
          return;
        }
        setErrorMessage(t(`cook.modal.error.${result.reason}`, { defaultValue: result.reason }));
      },
      onError: (err) => {
        setErrorMessage(err.message);
      },
    }
  );
  return {
    submit: (input) => {
      setErrorMessage(null);
      mutation.mutate(input);
    },
    isPending: mutation.isPending,
    errorMessage,
  };
}
