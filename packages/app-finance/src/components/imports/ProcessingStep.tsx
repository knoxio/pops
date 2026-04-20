import { ArrowRight } from 'lucide-react';

import { Button, LoadingProgressStep } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { ProgressDisplay } from './processing/ProgressDisplay';
import {
  useAutoStart,
  useCompletionHandler,
  useHasAlreadyProcessed,
  useProcessingMutations,
} from './processing/useProcessing';
import { FatalErrorPanel, WarningCard } from './processing/WarningsAndErrors';

import type { ImportWarning, ProcessImportOutput } from '@pops/api/modules/finance/imports';

function AlreadyProcessedView({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <LoadingProgressStep
        done
        title="Already processed"
        message="Your transactions are ready for review. Nothing to re-run."
      />
      <div className="flex justify-center pb-6">
        <Button onClick={onContinue}>
          <ArrowRight className="h-4 w-4" />
          Continue to Review
        </Button>
      </div>
    </>
  );
}

function getCompletedWarnings(progressData: unknown): ImportWarning[] | null {
  const data = progressData as { result?: ProcessImportOutput } | null | undefined;
  if (!data?.result) return null;
  const warnings = data.result.warnings;
  return warnings && warnings.length > 0 ? warnings : null;
}

function shouldShowContinue(progressData: unknown): boolean {
  const data = progressData as { status?: string; result?: ProcessImportOutput } | null | undefined;
  if (data?.status !== 'completed') return false;
  return Boolean(
    data.result?.warnings?.some(
      (w: ImportWarning) => w.type === 'AI_CATEGORIZATION_UNAVAILABLE' || w.type === 'AI_API_ERROR'
    )
  );
}

/**
 * Step 3: Process transactions (deduplicate and match entities)
 * Now with real-time progress updates via polling
 */
export function ProcessingStep() {
  const { parsedTransactions, nextStep } = useImportStore();
  const hasAlreadyProcessed = useHasAlreadyProcessed();
  const state = useProcessingMutations();
  useCompletionHandler(state);
  useAutoStart(state, hasAlreadyProcessed);

  if (hasAlreadyProcessed) return <AlreadyProcessedView onContinue={nextStep} />;

  const { processImportMutation, progressQuery, pollingEnabled } = state;
  const progress = progressQuery.data;
  const isProcessing = pollingEnabled && progress?.status === 'processing';
  const completedWarnings = getCompletedWarnings(progressQuery.data);
  const handleRetry = () => {
    processImportMutation.reset();
    processImportMutation.mutate({ transactions: parsedTransactions, account: 'Amex' });
  };
  const isFailure = processImportMutation.isError || progressQuery.data?.status === 'failed';

  return (
    <div className="flex flex-col items-center space-y-6">
      <ProgressDisplay
        isProcessing={Boolean(isProcessing)}
        progress={progress as never}
        parsedCount={parsedTransactions.length}
      />
      {completedWarnings?.map((warning) => (
        <WarningCard key={warning.type} warning={warning} />
      ))}
      {isFailure && (
        <FatalErrorPanel
          errorMessage={processImportMutation.error?.message}
          errors={progressQuery.data?.errors}
          onRetry={handleRetry}
        />
      )}
      {shouldShowContinue(progressQuery.data) && (
        <Button onClick={nextStep} className="mt-4">
          Continue to Review
        </Button>
      )}
    </div>
  );
}
