/**
 * PRD-138 — single row in the Rejected tab.
 *
 * Pure presentational: parent owns the `undo` callback + the `isUndoing`
 * state. Title falls back to the synthetic `<no title>` placeholder per
 * the PRD when the version never had one assigned (rejected pre-extract).
 */
import { type ReactElement } from 'react';
import { Link } from 'react-router';

import { Badge, Button } from '@pops/ui';

import {
  type IngestSourceKind,
  type RejectedRow as RejectedRowData,
  truncate,
  relativeTimeFrom,
} from './inbox-types.js';

function displaySourceUrl(
  url: string | null,
  kind: IngestSourceKind,
  t: (key: string) => string
): string {
  if (url !== null) return truncate(url, 60);
  if (kind === 'text') return t('inbox.rejected.row.textIndicator');
  return t('inbox.rejected.row.screenshotIndicator');
}

interface Props {
  row: RejectedRowData;
  onUndo: (versionId: number) => void;
  isUndoing: boolean;
  /** Override "now" so RTL tests can pin the relative-time string. */
  now?: Date;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function RejectedRowCard({ row, onUndo, isUndoing, now, t }: Props): ReactElement {
  const titleDisplay = row.title ?? t('inbox.rejected.row.noTitle');
  const sourceUrlDisplay = displaySourceUrl(row.sourceUrl, row.ingestKind, t);
  const rejectedAt = relativeTimeFrom(row.rejectedAt, now ?? new Date());
  return (
    <article
      data-testid={`rejected-row-${row.versionId}`}
      className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-card p-4"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/food/inbox/${row.sourceId}`}
            className="truncate text-base font-semibold hover:underline"
          >
            {titleDisplay}
          </Link>
          <Badge variant="secondary">{t(`inbox.rejected.reason.${row.reason}`)}</Badge>
          <Badge variant="outline">{t(`inbox.ingestKind.${row.ingestKind}`)}</Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">{sourceUrlDisplay}</p>
        <p className="text-xs text-muted-foreground">
          {t('inbox.rejected.row.rejectedAt', { when: rejectedAt })}
          {row.ingestCostUsd !== null && row.ingestCostUsd > 0
            ? ` · ${t('inbox.rejected.row.cost', { usd: row.ingestCostUsd.toFixed(3) })}`
            : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label={t('inbox.rejected.row.undoAria', { title: titleDisplay })}
          disabled={isUndoing}
          onClick={() => onUndo(row.versionId)}
        >
          {isUndoing ? t('inbox.rejected.row.undoing') : t('inbox.rejected.row.undo')}
        </Button>
      </div>
    </article>
  );
}
