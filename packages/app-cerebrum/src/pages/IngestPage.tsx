import { useTranslation } from 'react-i18next';

/**
 * IngestPage — route-level component for creating engrams.
 *
 * Owns the page shell (header, layout) and delegates form rendering
 * to the IngestForm component with the useIngestPageModel hook.
 */
import { PageHeader } from '@pops/ui';

import { IngestForm } from '../components/IngestForm';
import { useIngestPageModel } from './ingest-page/useIngestPageModel';

export function IngestPage() {
  const { t } = useTranslation('cerebrum');
  const model = useIngestPageModel();

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title={t('ingest.title')} description={t('ingest.description')} />
      <IngestForm model={model} />
    </div>
  );
}
