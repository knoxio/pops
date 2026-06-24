/**
 * Mutation hook for `markCooked`.
 *
 * Owns the result-shape branching (`ok: true` → close + onSuccess; `ok:
 * false` → i18n error surface) and the search-for-consume cache
 * invalidation. The `BatchOverridePicker` reads that cache, so any cook
 * must invalidate it.
 *
 * `onSuccess` receives the chosen yield location alongside the run +
 * batch ids so the parent toast can localise the message per location.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { unwrap } from '../../food-api-helpers.js';
import { cookMarkCooked } from '../../food-api/index.js';

import type { CookMarkCookedData } from '../../food-api/types.gen.js';
import type { buildSubmitInput } from './cook-modal-helpers.js';
import type { CookedSuccess } from './CookModal.js';

type MarkCookedInput = NonNullable<CookMarkCookedData['body']>;

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
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: MarkCookedInput) => unwrap(await cookMarkCooked({ body: input })),
    onSuccess: (result, input) => {
      if (result.ok) {
        setErrorMessage(null);
        void queryClient.invalidateQueries({ queryKey: ['food', 'batches', 'searchForConsume'] });
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
    onError: (err: Error) => {
      setErrorMessage(err.message);
    },
  });
  return {
    submit: (input) => {
      setErrorMessage(null);
      mutation.mutate(input);
    },
    isPending: mutation.isPending,
    errorMessage,
  };
}
