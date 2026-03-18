import { useImportStore } from "../../store/importStore";
import { UploadStep } from "./UploadStep";
import { ColumnMapStep } from "./ColumnMapStep";
import { ProcessingStep } from "./ProcessingStep";
import { ReviewStep } from "./ReviewStep";
import { TagReviewStep } from "./TagReviewStep";
import { SummaryStep } from "./SummaryStep";
import { Progress } from "@pops/ui";

/**
 * Import wizard orchestrator - manages 6-step flow
 */
export function ImportWizard() {
  const currentStep = useImportStore((state) => state.currentStep);

  const steps = [
    { number: 1, label: "Upload", component: UploadStep },
    { number: 2, label: "Map", component: ColumnMapStep },
    { number: 3, label: "Process", component: ProcessingStep },
    { number: 4, label: "Review", component: ReviewStep },
    { number: 5, label: "Tags", component: TagReviewStep },
    { number: 6, label: "Summary", component: SummaryStep },
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
                  ? "text-blue-600 dark:text-blue-400 font-semibold"
                  : step.number < currentStep
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-400 dark:text-gray-600"
              }`}
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm
                  ${
                    step.number === currentStep
                      ? "bg-blue-100 dark:bg-blue-900 border-2 border-blue-600"
                      : step.number < currentStep
                        ? "bg-green-100 dark:bg-green-900 border-2 border-green-600"
                        : "bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700"
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
        {CurrentStepComponent ? (
          <CurrentStepComponent />
        ) : (
          <div>Unknown step</div>
        )}
      </div>
    </div>
  );
}
