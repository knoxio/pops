import { useEffect } from 'react';

import { PageHeader } from '@pops/ui';

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
      <PageHeader
        title="Import Transactions"
        description="Import transactions from your bank CSV files into POPS"
      />

      <ImportWizard />
    </div>
  );
}
