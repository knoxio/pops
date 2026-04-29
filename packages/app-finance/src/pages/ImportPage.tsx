import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { ImportWizard } from '../components/imports/ImportWizard';
import { useImportStore } from '../store/importStore';

/**
 * Import page - wraps the import wizard
 */
export function ImportPage() {
  const { t } = useTranslation('finance');
  const reset = useImportStore((state) => state.reset);

  // Reset wizard state when page loads
  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('import.title')} description={t('import.description')} />

      <ImportWizard />
    </div>
  );
}
