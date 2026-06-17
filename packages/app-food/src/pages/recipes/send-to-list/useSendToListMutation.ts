/**
 * Mutation hook for the send-to-list modal — PRD-142.
 *
 * Surfaces a structured local error string (the modal renders inline; the
 * mutation itself never throws) and an `onSuccess(listId, listName)`
 * callback hook for the modal to close + toast.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

import { unwrap } from '../../../food-api-helpers.js';
import { sendToListSend } from '../../../food-api/index.js';

import type { SendToListSendData } from '../../../food-api/types.gen.js';
import type { TFunction } from 'i18next';

import type { SendError } from './types.js';

type SendTarget = NonNullable<SendToListSendData['body']>['target'];

export interface SendInput {
  versionId: number;
  scaleFactor: number;
  target: SendTarget;
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
  const mutation = useMutation({
    mutationFn: async ({ versionId, scaleFactor, target }: SendInput) =>
      unwrap(await sendToListSend({ path: { versionId }, body: { scaleFactor, target } })),
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
      setErrorMessage(reasonToMessage(result.reason, t));
    },
    onError: (err: Error) => {
      setErrorMessage(t('recipes.detail.sendToList.error.network', { message: err.message }));
    },
  });
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
