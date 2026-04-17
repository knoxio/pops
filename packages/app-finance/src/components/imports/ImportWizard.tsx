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

/**
 * Import wizard orchestrator - manages 7-step flow
 */
export function ImportWizard() {
  const currentStep = useImportStore((state) => state.currentStep);

  const steps = [
    { number: 1, label: 'Upload', component: UploadStep },
    { number: 2, label: 'Map', component: ColumnMapStep },
    { number: 3, label: 'Process', component: ProcessingStep },
    { number: 4, label: 'Review', component: ReviewStep },
    { number: 5, label: 'Tags', component: TagReviewStep },
    { number: 6, label: 'Commit', component: FinalReviewStep },
    { number: 7, label: 'Summary', component: SummaryStep },
  ];

  const CurrentStepComponent = steps[currentStep - 1]?.component;
  const progress = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Progress indicator */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {steps.map((step) => (
            <div
              key={step.number}
              className={`flex items-center gap-2 ${
                step.number === currentStep
                  ? 'text-info font-semibold'
                  : step.number < currentStep
                    ? 'text-success'
                    : 'text-gray-400 dark:text-gray-600'
              }`}
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm
                  ${
                    step.number === currentStep
                      ? 'bg-info/10 border-2 border-info'
                      : step.number < currentStep
                        ? 'bg-success/10 border-2 border-success'
                        : 'bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700'
                  }
                `}
              >
                {step.number}
              </div>
              <span className="text-sm hidden sm:inline">{step.label}</span>
            </div>
          ))}
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Current step content */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border shadow-sm p-6">
        {currentStep === 4 ? (
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading review…</div>}>
            <ReviewStep />
          </Suspense>
        ) : CurrentStepComponent ? (
          <CurrentStepComponent />
        ) : (
          <div>Unknown step</div>
        )}
      </div>
    </div>
  );
}
