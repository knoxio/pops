import { useEffect } from 'react';

import { ImportWizard } from '../components/imports/ImportWizard';
import { useImportStore } from '../store/importStore';

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Import Transactions</h1>
        <p className="text-muted-foreground">
          Import transactions from your bank CSV files into POPS
        </p>
      </div>

      <ImportWizard />
    </div>
  );
}
