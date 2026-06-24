import { type ReactElement } from 'react';

import { Badge, Button } from '@pops/ui';

import {
  type FailedRow as FailedRowData,
  type IngestSourceKind,
  truncate,
  relativeTimeFrom,
} from './inbox-types.js';

function displaySourceUrl(
  url: string | null,
  kind: IngestSourceKind,
  t: (key: string) => string
): string {
  if (url !== null) return truncate(url, 60);
  if (kind === 'text') return t('inbox.failed.row.textIndicator');
  return t('inbox.failed.row.screenshotIndicator');
}

interface Props {
  row: FailedRowData;
  onRetry: (sourceId: number) => void;
  onViewSource: (row: FailedRowData) => void;
  isRetrying: boolean;
  now?: Date;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function FailedRowCard({
  row,
  onRetry,
  onViewSource,
  isRetrying,
  now,
  t,
}: Props): ReactElement {
  const sourceUrlDisplay = displaySourceUrl(row.sourceUrl, row.ingestKind, t);
  const ingestedAt = relativeTimeFrom(row.ingestedAt, now ?? new Date());
  const errorLabel = row.errorCode;
  return (
    <article
      data-testid={`failed-row-${row.sourceId}`}
      className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-card p-4"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base font-semibold">{sourceUrlDisplay}</span>
          <Badge variant="outline">{t(`inbox.ingestKind.${row.ingestKind}`)}</Badge>
          <Badge variant="destructive">{errorLabel}</Badge>
        </div>
        <p className="line-clamp-2 break-all text-sm text-muted-foreground">
          {truncate(row.errorMessage, 120)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('inbox.failed.row.ingestedAt', { when: ingestedAt })}
          {' · '}
          {t('inbox.failed.row.attempts', { count: row.attempts })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onViewSource(row)}
          aria-label={t('inbox.failed.row.viewSourceAria', { code: errorLabel })}
        >
          {t('inbox.failed.row.viewSource')}
        </Button>
        <Button
          size="sm"
          aria-label={t('inbox.failed.row.retryAria', { code: errorLabel })}
          disabled={isRetrying}
          onClick={() => onRetry(row.sourceId)}
        >
          {isRetrying ? t('inbox.failed.row.retrying') : t('inbox.failed.row.retry')}
        </Button>
      </div>
    </article>
  );
}
