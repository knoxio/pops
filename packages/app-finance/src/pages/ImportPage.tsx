import { useEffect } from "react";
import { ImportWizard } from "../components/imports/ImportWizard";
import { useImportStore } from "../store/importStore";

/**
 * Import page - wraps the import wizard
 */
export function ImportPage() {
  const reset = useImportStore((state) => state.reset);

  // Reset wizard state when page loads
  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Import Transactions</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Import transactions from your bank CSV files into POPS
        </p>
      </div>

      <ImportWizard />
    </div>
  );
}
