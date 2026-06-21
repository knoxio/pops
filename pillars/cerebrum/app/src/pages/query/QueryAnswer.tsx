import { useTranslation } from 'react-i18next';
/**
 * QueryAnswer — renders the streamed/returned answer plus source
 * citations (PRD-082). Each `type === 'engram'` citation is a link to
 * the engram detail surface (`/cerebrum/engrams/:id`); other domains
 * render as inert rows because they have no dedicated detail page yet.
 */
import { Link } from 'react-router';

import { Badge, Button, Skeleton } from '@pops/ui';

import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';

import type { QueryAnswer, QuerySourceCitation } from '../../query/types';

interface QueryAnswerProps {
  answer: QueryAnswer | null;
  isAsking: boolean;
  isSavingDocument: boolean;
  error: string | null;
  onSaveAsDocument: () => void;
}

function CitationRow({ source }: { source: QuerySourceCitation }) {
  const { t } = useTranslation('cerebrum');
  const isEngram = source.type === 'engram';
  const relevance = `${Math.round(source.relevance * 100)}%`;
  return (
    <li
      data-testid="query-source"
      data-source-type={source.type}
      className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        {isEngram ? (
          <Link
            to={`/cerebrum/engrams/${source.id}`}
            className="inline-flex items-center gap-1 font-mono text-xs text-app-accent hover:underline"
            data-testid="query-source-link"
          >
            {source.id}
          </Link>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">{source.id}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {t('query.result.relevance', { value: relevance })}
        </span>
      </div>
      <p className="text-sm font-medium">{source.title || t('query.result.untitled')}</p>
      {source.excerpt ? (
        <p className="text-xs text-muted-foreground leading-relaxed">{source.excerpt}</p>
      ) : null}
      <div className="flex flex-wrap gap-1 pt-1">
        <Badge variant="outline" className="text-[10px]">
          {source.type}
        </Badge>
        {source.scope ? (
          <Badge variant="secondary" className="text-[10px]">
            {source.scope}
          </Badge>
        ) : null}
      </div>
    </li>
  );
}

const CONFIDENCE_VARIANT: Record<QueryAnswer['confidence'], 'default' | 'secondary' | 'outline'> = {
  high: 'default',
  medium: 'secondary',
  low: 'outline',
};

function ConfidenceBadge({ confidence }: { confidence: QueryAnswer['confidence'] }) {
  const { t } = useTranslation('cerebrum');
  return (
    <Badge variant={CONFIDENCE_VARIANT[confidence]} data-testid="query-confidence">
      {t(`query.confidence.${confidence}`)}
    </Badge>
  );
}

function LoadingPanel() {
  const { t } = useTranslation('cerebrum');
  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-card p-4"
      data-testid="query-loading"
    >
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('query.result.title')}
      </h3>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </section>
  );
}

function ErrorPanel({ error }: { error: string }) {
  const { t } = useTranslation('cerebrum');
  return (
    <section
      className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      data-testid="query-error"
    >
      <h3 className="text-xs font-semibold uppercase">{t('query.result.error.title')}</h3>
      <p>{error}</p>
    </section>
  );
}

function EmptyPanel() {
  const { t } = useTranslation('cerebrum');
  return (
    <section
      className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center"
      data-testid="query-empty"
    >
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('query.result.title')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('query.result.empty')}</p>
    </section>
  );
}

export function QueryAnswerPanel({
  answer,
  isAsking,
  isSavingDocument,
  error,
  onSaveAsDocument,
}: QueryAnswerProps) {
  const { t } = useTranslation('cerebrum');
  if (isAsking && !answer) return <LoadingPanel />;
  if (error) return <ErrorPanel error={error} />;
  if (!answer) return <EmptyPanel />;

  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      data-testid="query-answer"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            {t('query.result.title')}
          </h3>
          <ConfidenceBadge confidence={answer.confidence} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSavingDocument}
          onClick={onSaveAsDocument}
          className={TOUCH_TARGET_MIN_HEIGHT}
          data-testid="query-save-document"
        >
          {isSavingDocument ? t('query.actions.saving') : t('query.actions.saveAsDocument')}
        </Button>
      </header>

      <p className="whitespace-pre-wrap text-sm leading-relaxed" data-testid="query-answer-body">
        {answer.answer}
      </p>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('query.result.sources', { count: answer.sources.length })}
        </h4>
        {answer.sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('query.result.noSources')}</p>
        ) : (
          <ul className="space-y-2">
            {answer.sources.map((source) => (
              <CitationRow key={`${source.type}:${source.id}`} source={source} />
            ))}
          </ul>
        )}
      </div>

      {answer.scopes.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('query.result.scopes', { scopes: answer.scopes.join(', ') })}
        </p>
      ) : null}
    </section>
  );
}
