import { useEffect, useState } from 'react';

import { trpc } from '@pops/api-client';

import { useImportStore } from '../../../store/importStore';

import type { ImportWarning, ProcessImportOutput } from '@pops/api/modules/finance/imports';

export function useHasAlreadyProcessed(): boolean {
  const { processedTransactions, processedForFingerprint, parsedTransactionsFingerprint } =
    useImportStore();
  const hasProcessedResults =
    processedTransactions.matched.length +
      processedTransactions.uncertain.length +
      processedTransactions.failed.length +
      processedTransactions.skipped.length >
    0;
  return (
    hasProcessedResults &&
    processedForFingerprint !== null &&
    processedForFingerprint === parsedTransactionsFingerprint
  );
}

export function useProcessingMutations() {
  const { setProcessSessionId, processSessionId } = useImportStore();
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const processImportMutation = trpc.finance.imports.processImport.useMutation({
    onSuccess: (data) => {
      setProcessSessionId(data.sessionId);
      setPollingEnabled(true);
    },
    onError: (error) => console.error('Processing error:', error),
  });
  const progressQuery = trpc.finance.imports.getImportProgress.useQuery(
    { sessionId: processSessionId ?? '' },
    {
      enabled: pollingEnabled && !!processSessionId,
      refetchInterval: 1000,
      refetchIntervalInBackground: true,
    }
  );
  return { pollingEnabled, setPollingEnabled, processImportMutation, progressQuery };
}

export type ProcessingState = ReturnType<typeof useProcessingMutations>;

export function useCompletionHandler(state: ProcessingState): void {
  const { setProcessedTransactions, nextStep } = useImportStore();
  const { progressQuery, setPollingEnabled } = state;
  useEffect(() => {
    if (progressQuery.data?.status === 'completed' && progressQuery.data.result) {
      setPollingEnabled(false);
      const result = progressQuery.data.result as ProcessImportOutput;
      setProcessedTransactions(result);
      const hasCriticalError = result.warnings?.some(
        (w: ImportWarning) => w.type === 'AI_API_ERROR'
      );
      if (hasCriticalError) {
        console.error('[Import] Processing completed with critical errors - review warnings');
        return;
      }
      nextStep();
    }
    if (progressQuery.data?.status === 'failed') setPollingEnabled(false);
  }, [progressQuery.data, setProcessedTransactions, nextStep, setPollingEnabled]);
}

export function useAutoStart(state: ProcessingState, hasAlreadyProcessed: boolean): void {
  const { parsedTransactions } = useImportStore();
  const { processImportMutation } = state;
  useEffect(() => {
    if (
      parsedTransactions.length > 0 &&
      !hasAlreadyProcessed &&
      !processImportMutation.isPending &&
      !processImportMutation.isSuccess
    ) {
      processImportMutation.mutate({ transactions: parsedTransactions, account: 'Amex' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedTransactions.length, hasAlreadyProcessed]);
}
