/**
 * QueryPage — `/cerebrum/query` (PRD-082).
 *
 * Natural-language Q&A surface outside the Ego chat. Single-shot
 * question input, an answer panel with citations linking to the
 * engram detail surface, a re-runnable history sidebar, and a
 * "Save as document" action that dispatches to the PRD-083 emit
 * pipeline.
 *
 * Streaming answer generation is out of scope for the initial
 * implementation per PRD-082 ("Out of Scope" section); when the server
 * grows a streaming endpoint, only `useQueryPageModel` needs to change
 * — the answer panel is already laid out for a progressively-rendered
 * answer.
 */
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { useQueryPageModel } from '../query/useQueryPageModel';
import { QueryAnswerPanel } from './query/QueryAnswer';
import { QueryForm } from './query/QueryForm';
import { QueryHistorySidebar } from './query/QueryHistorySidebar';

export function QueryPage() {
  const { t } = useTranslation('cerebrum');
  const model = useQueryPageModel();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <PageHeader title={t('query.title')} description={t('query.description')} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]">
        <QueryHistorySidebar
          history={model.history}
          activeId={model.lastSubmittedId}
          onRerun={model.onRerun}
          onRemove={model.onRemoveHistory}
        />
        <div className="space-y-4">
          <QueryForm
            form={model.form}
            setForm={model.setForm}
            isAsking={model.isAsking}
            onAsk={model.onAsk}
          />
          <QueryAnswerPanel
            answer={model.answer}
            isAsking={model.isAsking}
            isSavingDocument={model.isSavingDocument}
            error={model.error}
            onSaveAsDocument={model.onSaveAsDocument}
          />
        </div>
      </div>
    </div>
  );
}
