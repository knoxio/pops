/**
 * Mutation hook for the send-to-list modal — PRD-142.
 *
 * Surfaces a structured local error string (the modal renders inline; the
 * mutation itself never throws) and an `onSuccess(listId, listName)`
 * callback hook for the modal to close + toast.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarMutation } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { TFunction } from 'i18next';

import type { AppRouter } from '@pops/api';

import type { SendError } from './types.js';

type SendToListInput = inferRouterInputs<AppRouter>['food']['recipes']['sendToList'];
type SendToListOutput = inferRouterOutputs<AppRouter>['food']['recipes']['sendToList'];

export interface SendInput {
  versionId: number;
  scaleFactor: number;
  target: { kind: 'existing'; listId: number } | { kind: 'new'; name: string };
}

export interface SendOutcome {
  listId: number;
  addedCount: number;
  mergedCount: number;
}

interface UseSendOpts {
  onSuccess: (outcome: SendOutcome) => void;
}

function reasonToMessage(reason: SendError, t: TFunction): string {
  return t(`recipes.detail.sendToList.error.${reason}`, {
    defaultValue: t('recipes.detail.sendToList.error.Unknown'),
  });
}

export function useSendToListMutation({ onSuccess }: UseSendOpts) {
  const { t } = useTranslation('food');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = usePillarMutation<SendToListInput, SendToListOutput>(
    'food',
    ['recipes', 'sendToList'],
    {
      onSuccess: (result) => {
        if (result.ok) {
          setErrorMessage(null);
          onSuccess({
            listId: result.listId,
            addedCount: result.addedCount,
            mergedCount: result.mergedCount,
          });
          return;
        }
        setErrorMessage(reasonToMessage(result.reason as SendError, t));
      },
      onError: (err) => {
        setErrorMessage(t('recipes.detail.sendToList.error.network', { message: err.message }));
      },
    }
  );
  const clearError = useCallback(() => setErrorMessage(null), []);
  const submit = useCallback(
    (input: SendInput) => {
      setErrorMessage(null);
      mutation.mutate(input);
    },
    [mutation]
  );
  return {
    submit,
    errorMessage,
    clearError,
    isPending: mutation.isPending,
  };
}
