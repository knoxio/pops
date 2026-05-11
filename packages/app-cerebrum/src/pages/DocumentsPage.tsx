/**
 * DocumentsPage — `/cerebrum/documents` (PRD-083).
 *
 * Surface for generating reports/summaries/timelines from the engram
 * corpus. Preview + Generate use the existing
 * `cerebrum.emit.{preview,generate}` procedures and surface the latest
 * result inline. Regenerate re-submits the current form state.
 *
 * History persistence is intentionally deferred — see the follow-up
 * issue referenced in the PR description.
 */
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { useDocumentsModel } from '../documents/useDocumentsModel';
import { DocumentsForm } from './documents/DocumentsForm';
import { PreviewBlock, ResultBlock } from './documents/DocumentsResult';

export function DocumentsPage() {
  const { t } = useTranslation('cerebrum');
  const model = useDocumentsModel();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <PageHeader title={t('documents.title')} description={t('documents.description')} />
      <div className="grid grid-cols-1 md:grid-cols-[20rem_1fr] gap-6">
        <DocumentsForm
          form={model.form}
          setForm={model.setForm}
          isGenerating={model.isGenerating}
          isPreviewing={model.isPreviewing}
          hasGenerated={model.document !== null}
          onPreview={model.onPreview}
          onGenerate={model.onGenerate}
          onRegenerate={model.onRegenerate}
        />
        <div className="space-y-6">
          <PreviewBlock preview={model.preview} />
          <ResultBlock document={model.document} notice={model.notice} />
        </div>
      </div>
    </div>
  );
}
