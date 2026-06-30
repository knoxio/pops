import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsGetImportProgress,
  importsProcessImport,
  type ImportsGetImportProgressResponses,
  type ImportsProcessImportData,
} from '../../../finance-api/index.js';
import { useImportStore } from '../../../store/importStore';

import type { ImportWarning, ProcessImportOutput } from '@pops/finance';

type ProcessImportBody = NonNullable<ImportsProcessImportData['body']>;
type ProgressResponse = NonNullable<ImportsGetImportProgressResponses[200]>;
interface ImportProgressShape {
  sessionId: string;
  status: ProgressResponse['status'];
  result?: ProcessImportOutput;
  errors?: ProgressResponse['errors'];
  currentStep?: ProgressResponse['currentStep'];
  totalTransactions: number;
  processedCount: number;
  currentBatch: ProgressResponse['currentBatch'];
}

function toProgressShape(res: ImportsGetImportProgressResponses[200]): ImportProgressShape | null {
  if (!res) return null;
  const result = res.result && 'matched' in res.result ? res.result : undefined;
  return {
    sessionId: res.sessionId,
    status: res.status,
    result,
    errors: res.errors,
    currentStep: res.currentStep,
    totalTransactions: res.totalTransactions,
    processedCount: res.processedCount,
    currentBatch: res.currentBatch,
  };
}

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
  const queryClient = useQueryClient();
  const processImportMutation = useMutation({
    mutationFn: async (vars: ProcessImportBody) =>
      unwrap(await importsProcessImport({ body: vars })),
    onSuccess: (data) => {
      setProcessSessionId(data.sessionId);
      setPollingEnabled(true);
    },
    onError: (error: Error) => console.error('Processing error:', error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance', 'imports'] }),
  });
  const sessionId = processSessionId ?? '';
  const progressQuery = useQuery({
    queryKey: ['finance', 'imports', 'getImportProgress', sessionId],
    queryFn: async (): Promise<ImportProgressShape | null> => {
      const res = await importsGetImportProgress({ query: { sessionId } });
      return toProgressShape(unwrap(res));
    },
    enabled: pollingEnabled && !!processSessionId,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
  });
  return { pollingEnabled, setPollingEnabled, processImportMutation, progressQuery };
}

export type ProcessingState = ReturnType<typeof useProcessingMutations>;

export function useCompletionHandler(state: ProcessingState): void {
  const { setProcessedTransactions, nextStep } = useImportStore();
  const { progressQuery, setPollingEnabled } = state;
  useEffect(() => {
    if (progressQuery.data?.status === 'completed' && progressQuery.data.result) {
      setPollingEnabled(false);
      const result = progressQuery.data.result;
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
