/**
 * DocumentsResult — renders the generated document (markdown body +
 * citations + metadata) and the preview outline. Read-only.
 */
import { useTranslation } from 'react-i18next';

import type { GeneratedDocument, PreviewResult, SourceCitation } from '../../documents/types';

function SourcesList({ sources }: { sources: SourceCitation[] }) {
  return (
    <ul className="text-xs text-muted-foreground space-y-1">
      {sources.map((source) => (
        <li key={source.id} data-testid="documents-source">
          <span className="font-mono">{source.id}</span>
          {source.title ? ` — ${source.title}` : ''}
        </li>
      ))}
    </ul>
  );
}

export function PreviewBlock({ preview }: { preview: PreviewResult | null }) {
  const { t } = useTranslation('cerebrum');
  if (!preview) {
    return (
      <section className="space-y-2" data-testid="documents-preview-empty">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('documents.preview.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('documents.preview.empty')}</p>
      </section>
    );
  }
  return (
    <section className="space-y-2" data-testid="documents-preview">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('documents.preview.title')}
      </h3>
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">
          {t('documents.preview.outline')}
        </p>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 text-xs">
          {preview.outline}
        </pre>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">
          {t('documents.preview.sources')}
        </p>
        <SourcesList sources={preview.sources} />
      </div>
    </section>
  );
}

export function ResultBlock({
  document,
  notice,
}: {
  document: GeneratedDocument | null;
  notice: string | null;
}) {
  const { t } = useTranslation('cerebrum');
  if (!document) {
    return (
      <section className="space-y-2" data-testid="documents-result-empty">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('documents.result.title')}
        </h3>
        {notice ? (
          <p className="text-sm" data-testid="documents-result-notice">
            {t('documents.result.notice', { notice })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('documents.result.empty')}</p>
        )}
      </section>
    );
  }
  return (
    <section className="space-y-3" data-testid="documents-result">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('documents.result.title')}
      </h3>
      <h2 className="text-lg font-semibold">{document.title}</h2>
      <pre className="whitespace-pre-wrap text-sm leading-relaxed">{document.body}</pre>
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">
          {t('documents.result.sources')}
        </p>
        <SourcesList sources={document.sources} />
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">
          {t('documents.result.metadata')}
        </p>
        <pre className="rounded-md border border-border bg-muted/50 p-2 text-xs overflow-auto">
          {JSON.stringify(document.metadata, null, 2)}
        </pre>
      </div>
    </section>
  );
}
