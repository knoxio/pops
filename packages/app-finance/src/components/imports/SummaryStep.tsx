import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useImportStore } from "../../store/importStore";
import { Button } from "@pops/ui";
import { useNavigate } from "react-router";

/**
 * Step 5: Import summary and results
 */
export function SummaryStep() {
  const { importResult, processedTransactions, reset } = useImportStore();
  const navigate = useNavigate();

  if (!importResult) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-gray-500">No import results available</p>
        {processedTransactions.warnings && processedTransactions.warnings.length > 0 && (
          <div className="max-w-md mx-auto space-y-2">
            <p className="text-sm text-gray-600">Import warnings:</p>
            {processedTransactions.warnings.map((warning, idx) => (
              <div
                key={idx}
                className="p-3 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-left"
              >
                <p className="font-medium text-amber-900 dark:text-amber-100">{warning.message}</p>
                {warning.details && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 font-mono">
                    {warning.details}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Import Complete</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {importResult.imported} imported, {importResult.failed.length} failed,{" "}
          {importResult.skipped} skipped
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-2xl font-semibold text-green-900 dark:text-green-100">
            {importResult.imported}
          </div>
          <div className="text-xs text-green-700 dark:text-green-300">Imported</div>
        </div>

        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-2xl font-semibold text-red-900 dark:text-red-100">
            {importResult.failed.length}
          </div>
          <div className="text-xs text-red-700 dark:text-red-300">Failed</div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <AlertCircle className="w-5 h-5 text-gray-600" />
          </div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {importResult.skipped}
          </div>
          <div className="text-xs text-gray-700 dark:text-gray-300">Skipped</div>
        </div>
      </div>

      {importResult.failed.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-red-50 dark:bg-red-950 px-4 py-2 border-b border-red-200 dark:border-red-800">
            <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">
              Failed Transactions
            </h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <ul className="divide-y dark:divide-gray-700">
              {importResult.failed.map((result, idx) => (
                <li key={idx} className="px-4 py-3 text-sm">
                  <div className="font-medium">{result.transaction.description}</div>
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {result.error ?? "Unknown error"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => {
            reset();
            navigate("/import");
          }}
        >
          New Import
        </Button>
        <Button onClick={() => navigate("/transactions")}>View Transactions</Button>
      </div>
    </div>
  );
}
