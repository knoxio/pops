import { LoadingProgressStep } from '@pops/ui';

type StepStatus = 'pending' | 'in_progress' | 'done';

interface ProgressLike {
  currentStep?: string;
  totalTransactions: number;
  processedCount: number;
  currentBatch: Array<{ description: string; status: string }>;
  errors?: Array<{ description: string; error: string }>;
}

function dedupStatus(progress: ProgressLike | undefined): StepStatus {
  if (progress?.currentStep === 'deduplicating') return 'in_progress';
  if (['matching', 'writing'].includes(progress?.currentStep ?? '')) return 'done';
  return 'pending';
}

function matchingStatus(progress: ProgressLike | undefined): StepStatus {
  if (progress?.currentStep === 'matching') return 'in_progress';
  if (progress?.currentStep === 'writing') return 'done';
  return 'pending';
}

interface ProgressDisplayProps {
  isProcessing: boolean;
  progress: ProgressLike | undefined;
  parsedCount: number;
}

function computePct(isProcessing: boolean, progress: ProgressLike | undefined): number | undefined {
  if (!isProcessing || !progress || progress.totalTransactions === 0) return undefined;
  return (progress.processedCount / progress.totalTransactions) * 100;
}

function buildSteps(isProcessing: boolean, progress: ProgressLike | undefined) {
  if (!isProcessing) return undefined;
  return [
    { label: 'Checking for duplicates', status: dedupStatus(progress) },
    { label: 'Matching entities', status: matchingStatus(progress) },
  ];
}

function buildBatchItems(isProcessing: boolean, progress: ProgressLike | undefined) {
  if (!isProcessing || !progress || progress.currentBatch.length === 0) return undefined;
  return progress.currentBatch.map((item) => ({
    description: item.description,
    status: item.status as 'processing' | 'success' | 'failed',
  }));
}

function buildErrors(progress: ProgressLike | undefined): string[] | undefined {
  if (!progress?.errors || progress.errors.length === 0) return undefined;
  const formatted = progress.errors.slice(0, 3).map((e) => `${e.description}: ${e.error}`);
  if (progress.errors.length > 3)
    formatted.push(`And ${progress.errors.length - 3} more errors...`);
  return formatted;
}

function computeMessage(
  isProcessing: boolean,
  progress: ProgressLike | undefined,
  parsedCount: number
): string {
  if (isProcessing && progress) {
    return `Processing ${progress.processedCount}/${progress.totalTransactions} transactions...`;
  }
  return `Analyzing ${parsedCount} transactions...`;
}

export function ProgressDisplay({ isProcessing, progress, parsedCount }: ProgressDisplayProps) {
  return (
    <LoadingProgressStep
      title="Processing"
      message={computeMessage(isProcessing, progress, parsedCount)}
      progress={computePct(isProcessing, progress)}
      steps={buildSteps(isProcessing, progress)}
      currentBatch={buildBatchItems(isProcessing, progress)}
      errors={buildErrors(progress)}
    />
  );
}
