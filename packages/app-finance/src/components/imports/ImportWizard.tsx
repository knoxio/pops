import { lazy, Suspense } from 'react';

import { Progress } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { ColumnMapStep } from './ColumnMapStep';
import { FinalReviewStep } from './FinalReviewStep';
import { ProcessingStep } from './ProcessingStep';
import { SummaryStep } from './SummaryStep';
import { TagReviewStep } from './TagReviewStep';
import { UploadStep } from './UploadStep';

const ReviewStep = lazy(() => import('./ReviewStep').then((m) => ({ default: m.ReviewStep })));

interface Step {
  number: number;
  label: string;
  component: React.ComponentType;
}

const STEPS: Step[] = [
  { number: 1, label: 'Upload', component: UploadStep },
  { number: 2, label: 'Map', component: ColumnMapStep },
  { number: 3, label: 'Process', component: ProcessingStep },
  { number: 4, label: 'Review', component: ReviewStep },
  { number: 5, label: 'Tags', component: TagReviewStep },
  { number: 6, label: 'Commit', component: FinalReviewStep },
  { number: 7, label: 'Summary', component: SummaryStep },
];

function getStepClasses(stepNumber: number, currentStep: number): { text: string; circle: string } {
  if (stepNumber === currentStep) {
    return {
      text: 'text-info font-semibold',
      circle: 'bg-info/10 border-2 border-info',
    };
  }
  if (stepNumber < currentStep) {
    return {
      text: 'text-success',
      circle: 'bg-success/10 border-2 border-success',
    };
  }
  return {
    text: 'text-gray-400 dark:text-gray-600',
    circle: 'bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700',
  };
}

function StepIndicator({ step, currentStep }: { step: Step; currentStep: number }) {
  const { text, circle } = getStepClasses(step.number, currentStep);
  return (
    <div className={`flex items-center gap-2 ${text}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${circle}`}>
        {step.number}
      </div>
      <span className="text-sm hidden sm:inline">{step.label}</span>
    </div>
  );
}

function StepContent({ currentStep }: { currentStep: number }) {
  if (currentStep === 4) {
    return (
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading review…</div>}>
        <ReviewStep />
      </Suspense>
    );
  }
  const Component = STEPS[currentStep - 1]?.component;
  return Component ? <Component /> : <div>Unknown step</div>;
}

/**
 * Import wizard orchestrator - manages 7-step flow
 */
export function ImportWizard() {
  const currentStep = useImportStore((state) => state.currentStep);
  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {STEPS.map((step) => (
            <StepIndicator key={step.number} step={step} currentStep={currentStep} />
          ))}
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg border shadow-sm p-6">
        <StepContent currentStep={currentStep} />
      </div>
    </div>
  );
}
