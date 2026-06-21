/**
 * BulkResultList — per-segment outcome list shown after a bulk paste
 * submission (PRD-081 US-08). Each row reuses the same enrichment chip
 * machinery as the single-capture result for consistency.
 */
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge, Button, Card } from '@pops/ui';

import { EnrichmentChips } from './EnrichmentChips';

import type { BulkSegmentOutcome } from '../pages/ingest-page/types';

interface BulkResultListProps {
  results: BulkSegmentOutcome[];
  isSubmitting: boolean;
  onRetry: (segmentIndex: number) => void;
  onReset: () => void;
}

export function BulkResultList({ results, isSubmitting, onRetry, onReset }: BulkResultListProps) {
  const { t } = useTranslation('cerebrum');
  const completed = results.filter((r) => r.result).length;
  const failed = results.filter((r) => r.error).length;
  const pending = results.length - completed - failed;
  return (
    <div className="space-y-4">
      <BulkSummary
        total={results.length}
        completed={completed}
        failed={failed}
        pending={pending}
        isSubmitting={isSubmitting}
      />
      <ul className="space-y-3">
        {results.map((row) => (
          <BulkRow key={row.index} row={row} onRetry={onRetry} />
        ))}
      </ul>
      <Button onClick={onReset} disabled={isSubmitting}>
        {t('ingest.bulk.captureAnother')}
      </Button>
    </div>
  );
}

function BulkSummary({
  total,
  completed,
  failed,
  pending,
  isSubmitting,
}: {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <h3 className="text-base font-semibold">{t('ingest.bulk.heading')}</h3>
      <Badge variant="secondary">{t('ingest.bulk.summary', { completed, total })}</Badge>
      {failed > 0 && (
        <Badge variant="destructive">{t('ingest.bulk.failedCount', { count: failed })}</Badge>
      )}
      {isSubmitting && pending > 0 && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />{' '}
          {t('ingest.bulk.inFlight', { count: pending })}
        </span>
      )}
    </div>
  );
}

function BulkRow({
  row,
  onRetry,
}: {
  row: BulkSegmentOutcome;
  onRetry: (segmentIndex: number) => void;
}) {
  return (
    <Card className="p-4 space-y-3">
      <BulkRowHeader row={row} onRetry={onRetry} />
      {row.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {row.error}
        </p>
      )}
      {row.result && <EnrichmentChips engramId={row.result.id} />}
    </Card>
  );
}

function BulkRowHeader({
  row,
  onRetry,
}: {
  row: BulkSegmentOutcome;
  onRetry: (segmentIndex: number) => void;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline">#{row.index + 1}</Badge>
          {row.result && <CheckCircle2 className="h-4 w-4 text-success" />}
          {row.error && <AlertCircle className="h-4 w-4 text-destructive" />}
          {!row.result && !row.error && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{row.preview}</p>
        {row.result && (
          <p className="text-xs font-mono text-muted-foreground break-all">{row.result.id}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {row.error && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRetry(row.index)}
            prefix={<RefreshCw className="h-3.5 w-3.5" />}
          >
            {t('ingest.bulk.retry')}
          </Button>
        )}
        {row.result && (
          <Link to={`/cerebrum/engrams/${row.result.id}`}>
            <Button size="sm" variant="ghost" prefix={<ExternalLink className="h-3.5 w-3.5" />}>
              {t('ingest.bulk.open')}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
