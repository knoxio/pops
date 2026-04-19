import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { trpc } from '@pops/api-client';
import { Button, LoadingProgressStep } from '@pops/ui';

import { useImportStore } from '../../store/importStore';

import type { ImportWarning, ProcessImportOutput } from '@pops/api/modules/finance/imports';

/**
 * Step 3: Process transactions (deduplicate and match entities)
 * Now with real-time progress updates via polling
 */
export function ProcessingStep() {
  const {
    parsedTransactions,
    parsedTransactionsFingerprint,
    processedForFingerprint,
    processedTransactions,
    setProcessSessionId,
    processSessionId,
    setProcessedTransactions,
    nextStep,
  } = useImportStore();
  const [pollingEnabled, setPollingEnabled] = useState(false);

  /**
   * Skip the expensive AI processing pipeline when the cached
   * `processedTransactions` in the store were demonstrably computed from the
   * *current* `parsedTransactions` — tracked via `processedForFingerprint`
   * matching `parsedTransactionsFingerprint`. The typical trigger is a
   * Back→Continue bounce inside the wizard that never actually mutated the
   * parsed input. Any real change (new file, re-mapped columns, different
   * row set) invalidates the fingerprint upstream in `setParsedTransactions`
   * and this gate will correctly re-run processing.
   */
  const hasProcessedResults =
    processedTransactions.matched.length +
      processedTransactions.uncertain.length +
      processedTransactions.failed.length +
      processedTransactions.skipped.length >
    0;
  const hasAlreadyProcessed =
    hasProcessedResults &&
    processedForFingerprint !== null &&
    processedForFingerprint === parsedTransactionsFingerprint;

  const processImportMutation = trpc.finance.imports.processImport.useMutation({
    onSuccess: (data) => {
      setProcessSessionId(data.sessionId);
      setPollingEnabled(true);
    },
    onError: (error) => {
      console.error('Processing error:', error);
    },
  });

  // Poll for progress every 1 second when enabled
  const progressQuery = trpc.finance.imports.getImportProgress.useQuery(
    { sessionId: processSessionId ?? '' },
    {
      enabled: pollingEnabled && !!processSessionId,
      refetchInterval: 1000,
      refetchIntervalInBackground: true,
    }
  );

  // Handle completion
  useEffect(() => {
    if (progressQuery.data?.status === 'completed' && progressQuery.data.result) {
      setPollingEnabled(false);

      // Type-cast to ProcessImportOutput since this is the processImport step
      const result = progressQuery.data.result as ProcessImportOutput;
      setProcessedTransactions(result);

      // Check if there are critical errors
      const hasCriticalError = result.warnings?.some(
        (w: ImportWarning) => w.type === 'AI_API_ERROR'
      );

      if (hasCriticalError) {
        // Don't auto-advance - let user see the error
        console.error('[Import] Processing completed with critical errors - review warnings');
      } else {
        // No critical errors - proceed to review (deduplication warnings are non-critical)
        nextStep();
      }
    }

    if (progressQuery.data?.status === 'failed') {
      setPollingEnabled(false);
    }
  }, [progressQuery.data, setProcessedTransactions, nextStep]);

  useEffect(() => {
    // Start processing automatically when step loads, unless we already have
    // results from a prior run (avoids re-running the AI pipeline on Back nav).
    if (
      parsedTransactions.length > 0 &&
      !hasAlreadyProcessed &&
      !processImportMutation.isPending &&
      !processImportMutation.isSuccess
    ) {
      processImportMutation.mutate({
        transactions: parsedTransactions,
        account: 'Amex',
      });
    }
  }, [parsedTransactions.length, hasAlreadyProcessed]);

  const handleRetry = (): void => {
    processImportMutation.reset();
    processImportMutation.mutate({
      transactions: parsedTransactions,
      account: 'Amex',
    });
  };

  const progress = progressQuery.data;
  const isProcessing = pollingEnabled && progress?.status === 'processing';

  // Short-circuit: already processed (user came back via Back nav). Let them
  // click Continue without re-running the pipeline.
  if (hasAlreadyProcessed) {
    return (
      <>
        <LoadingProgressStep
          done
          title="Already processed"
          message="Your transactions are ready for review. Nothing to re-run."
        />
        <div className="flex justify-center pb-6">
          <Button onClick={nextStep}>
            <ArrowRight className="h-4 w-4" />
            Continue to Review
          </Button>
        </div>
      </>
    );
  }

  const pct =
    isProcessing && progress && progress.totalTransactions > 0
      ? (progress.processedCount / progress.totalTransactions) * 100
      : undefined;

  const steps = isProcessing
    ? [
        {
          label: 'Checking for duplicates',
          status: (progress?.currentStep === 'deduplicating'
            ? 'in_progress'
            : ['matching', 'writing'].includes(progress?.currentStep ?? '')
              ? 'done'
              : 'pending') as 'pending' | 'in_progress' | 'done',
        },
        {
          label: 'Matching entities',
          status: (progress?.currentStep === 'matching'
            ? 'in_progress'
            : progress?.currentStep === 'writing'
              ? 'done'
              : 'pending') as 'pending' | 'in_progress' | 'done',
        },
      ]
    : undefined;

  const batchItems =
    isProcessing && progress && progress.currentBatch.length > 0
      ? progress.currentBatch.map((item) => ({
          description: item.description,
          status: item.status as 'processing' | 'success' | 'failed',
        }))
      : undefined;

  const warningErrors =
    progress?.errors && progress.errors.length > 0
      ? progress.errors
          .slice(0, 3)
          .map((e) => `${e.description}: ${e.error}`)
          .concat(
            progress.errors.length > 3 ? [`And ${progress.errors.length - 3} more errors...`] : []
          )
      : undefined;

  // Completed result warnings (AI unavailable etc.)
  const completedWarnings =
    progressQuery.data?.result &&
    (progressQuery.data.result as ProcessImportOutput).warnings?.length
      ? ((progressQuery.data.result as ProcessImportOutput).warnings ?? null)
      : null;

  return (
    <div className="flex flex-col items-center space-y-6">
      <LoadingProgressStep
        title="Processing"
        message={
          isProcessing && progress
            ? `Processing ${progress.processedCount}/${progress.totalTransactions} transactions...`
            : `Analyzing ${parsedTransactions.length} transactions...`
        }
        progress={pct}
        steps={steps}
        currentBatch={batchItems}
        errors={warningErrors}
      />

      {/* Warnings from completed result */}
      {completedWarnings &&
        completedWarnings.map((warning: ImportWarning) => (
          <div
            key={warning.type}
            className="w-full max-w-md p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-medium">
                  {warning.type === 'AI_CATEGORIZATION_UNAVAILABLE'
                    ? 'AI Categorization Unavailable'
                    : 'AI API Error'}
                </p>
                <p className="text-xs">{warning.message}</p>
                {warning.details && (
                  <p className="text-xs opacity-70 font-mono">{warning.details}</p>
                )}
                {warning.affectedCount && (
                  <p className="text-xs opacity-80">
                    {warning.affectedCount} transaction
                    {warning.affectedCount !== 1 ? 's' : ''} could not be automatically categorized.
                    You can manually categorize them in the review step.
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

      {/* Fatal errors */}
      {(processImportMutation.isError || progressQuery.data?.status === 'failed') && (
        <div className="p-4 max-w-md w-full text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-lg">
          <p className="font-medium mb-1">Processing Failed</p>
          <p>{processImportMutation.error?.message || 'An unexpected error occurred'}</p>
          {progressQuery.data?.errors && progressQuery.data.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {progressQuery.data.errors.map((error) => (
                <p key={error.error} className="text-xs">
                  • {error.error}
                </p>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-destructive hover:text-destructive"
            onClick={handleRetry}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {/* Continue button when processing complete with warnings */}
      {progressQuery.data?.status === 'completed' &&
        (progressQuery.data.result as ProcessImportOutput)?.warnings?.some(
          (w: ImportWarning) =>
            w.type === 'AI_CATEGORIZATION_UNAVAILABLE' || w.type === 'AI_API_ERROR'
        ) && (
          <Button onClick={nextStep} className="mt-4">
            Continue to Review
          </Button>
        )}
    </div>
  );
}
