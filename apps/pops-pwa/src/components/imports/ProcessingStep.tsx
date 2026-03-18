import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useImportStore } from "../../store/importStore";
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import type {
  ProcessImportOutput,
  ImportWarning,
} from "@pops/finance-api/modules/imports";

/**
 * Step 3: Process transactions (deduplicate and match entities)
 * Now with real-time progress updates via polling
 */
export function ProcessingStep() {
  const {
    parsedTransactions,
    setProcessSessionId,
    processSessionId,
    setProcessedTransactions,
    nextStep,
  } = useImportStore();
  const [pollingEnabled, setPollingEnabled] = useState(false);

  const processImportMutation = trpc.imports.processImport.useMutation({
    onSuccess: (data) => {
      setProcessSessionId(data.sessionId);
      setPollingEnabled(true);
    },
    onError: (error) => {
      console.error("Processing error:", error);
    },
  });

  // Poll for progress every 1 second when enabled
  const progressQuery = trpc.imports.getImportProgress.useQuery(
    { sessionId: processSessionId ?? "" },
    {
      enabled: pollingEnabled && !!processSessionId,
      refetchInterval: 1000,
      refetchIntervalInBackground: true,
    }
  );

  // Handle completion
  useEffect(() => {
    if (
      progressQuery.data?.status === "completed" &&
      progressQuery.data.result
    ) {
      setPollingEnabled(false);

      // Type-cast to ProcessImportOutput since this is the processImport step
      const result = progressQuery.data.result as ProcessImportOutput;
      setProcessedTransactions(result);

      // Check if there are critical errors
      const hasCriticalError = result.warnings?.some(
        (w: ImportWarning) =>
          w.type === "AI_API_ERROR"
      );

      if (hasCriticalError) {
        // Don't auto-advance - let user see the error
        console.error(
          "[Import] Processing completed with critical errors - review warnings"
        );
      } else {
        // No critical errors - proceed to review (deduplication warnings are non-critical)
        nextStep();
      }
    }

    if (progressQuery.data?.status === "failed") {
      setPollingEnabled(false);
    }
  }, [progressQuery.data, setProcessedTransactions, nextStep]);

  useEffect(() => {
    // Start processing automatically when step loads
    if (
      parsedTransactions.length > 0 &&
      !processImportMutation.isPending &&
      !processImportMutation.isSuccess
    ) {
      processImportMutation.mutate({
        transactions: parsedTransactions,
        account: "Amex",
      });
    }
  }, [parsedTransactions.length]);

  const progress = progressQuery.data;
  const isProcessing = pollingEnabled && progress?.status === "processing";

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      <Loader2 className="w-16 h-16 animate-spin text-blue-500" />

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">Processing</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {isProcessing && progress
            ? `Processing ${progress.processedCount}/${progress.totalTransactions} transactions...`
            : `Analyzing ${parsedTransactions.length} transactions...`}
        </p>
      </div>

      {/* Progress bar */}
      {isProcessing && progress && (
        <div className="w-full max-w-md">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>Progress</span>
            <span>
              {Math.round(
                (progress.processedCount / progress.totalTransactions) * 100
              )}
              %
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(progress.processedCount / progress.totalTransactions) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Current step indicator */}
      <div className="w-full max-w-md space-y-2">
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Checking for duplicates</span>
            <span>
              {progress?.currentStep === "deduplicating"
                ? "In progress..."
                : ["matching", "writing"].includes(progress?.currentStep ?? "")
                  ? "Complete"
                  : "Pending"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Matching entities</span>
            <span>
              {progress?.currentStep === "matching"
                ? "In progress..."
                : progress?.currentStep === "writing"
                  ? "Complete"
                  : "Pending"}
            </span>
          </div>
        </div>
      </div>

      {/* Current batch (up to 5 items) */}
      {isProcessing && progress && progress.currentBatch.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Currently processing:
          </p>
          <div className="space-y-1">
            {progress.currentBatch.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
              >
                {item.status === "processing" && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                {item.status === "success" && (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                )}
                {item.status === "failed" && (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span className="truncate">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors during processing */}
      {progress?.errors && progress.errors.length > 0 && (
        <div className="w-full max-w-md space-y-2">
          {progress.errors.slice(0, 3).map((error, idx) => (
            <div
              key={idx}
              className="p-3 text-sm text-amber-800 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-200 rounded-lg border border-amber-200 dark:border-amber-800"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-xs">{error.description}</p>
                  <p className="text-xs opacity-80 mt-0.5">{error.error}</p>
                </div>
              </div>
            </div>
          ))}
          {progress.errors.length > 3 && (
            <p className="text-xs text-gray-500 text-center">
              And {progress.errors.length - 3} more errors...
            </p>
          )}
        </div>
      )}

      {/* Warnings (from completed result) */}
      {progressQuery.data?.result &&
        (progressQuery.data.result as ProcessImportOutput).warnings &&
        (progressQuery.data.result as ProcessImportOutput).warnings!.length >
          0 && (
          <div className="w-full max-w-md space-y-2">
            {(progressQuery.data.result as ProcessImportOutput).warnings!.map(
              (warning: ImportWarning, idx: number) => {
                return (
                  <div
                    key={idx}
                    className="p-4 text-sm rounded-lg border text-amber-800 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-200 border-amber-200 dark:border-amber-800"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">
                          {warning.type === "AI_CATEGORIZATION_UNAVAILABLE"
                            ? "AI Categorization Unavailable"
                            : "AI API Error"}
                        </p>
                        <p className="text-xs">{warning.message}</p>
                        {warning.details && (
                          <p className="text-xs opacity-70 font-mono">
                            {warning.details}
                          </p>
                        )}
                        {warning.affectedCount && (
                          <p className="text-xs opacity-80">
                            {warning.affectedCount} transaction
                            {warning.affectedCount !== 1 ? "s" : ""} could not
                            be automatically categorized. You can manually
                            categorize them in the review step.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}

      {/* Fatal errors */}
      {(processImportMutation.isError ||
        progressQuery.data?.status === "failed") && (
        <div className="p-4 max-w-md text-sm text-red-700 bg-red-100 dark:bg-red-900 dark:text-red-200 rounded-lg">
          <p className="font-medium mb-1">Processing Failed</p>
          <p>
            {processImportMutation.error?.message ||
              "An unexpected error occurred"}
          </p>
          {progressQuery.data?.errors &&
            progressQuery.data.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {progressQuery.data.errors.map((error, idx) => (
                  <p key={idx} className="text-xs">
                    • {error.error}
                  </p>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Continue button when processing complete with warnings */}
      {progressQuery.data?.status === "completed" &&
        (progressQuery.data.result as ProcessImportOutput)?.warnings?.some(
          (w: ImportWarning) =>
            w.type === "AI_CATEGORIZATION_UNAVAILABLE" ||
            w.type === "AI_API_ERROR"
        ) && (
          <Button onClick={nextStep} className="mt-4">
            Continue to Review
          </Button>
        )}
    </div>
  );
}
