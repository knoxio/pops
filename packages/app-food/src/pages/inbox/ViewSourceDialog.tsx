/**
 * PRD-138 — read-only dialog showing the original ingest input.
 *
 * Per-kind rendering:
 *   - url-web / url-instagram → `<a>` link + sandboxed iframe preview
 *     (the `sandbox="allow-same-origin"` only — scripts disabled).
 *   - text → `<pre>` of the saved caption (fetched via inspection of the
 *     `ingest_sources.caption` column on the row; PRD-138 v1 receives
 *     this through a follow-up tRPC peek, but for now we render a stub
 *     copy explaining how to inspect via the source endpoint).
 *   - screenshot → `<img src="/api/food/ingest/source/<id>/screenshot">`.
 *
 * No DSL editor — there's no draft to edit at this point.
 */
import { type ReactElement } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { type FailedRow } from './inbox-types.js';

interface Props {
  row: FailedRow | null;
  onClose: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function ViewSourceDialog({ row, onClose, t }: Props): ReactElement | null {
  if (row === null) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="view-source-dialog">
        <DialogHeader>
          <DialogTitle>{t('inbox.failed.viewSource.title')}</DialogTitle>
          <DialogDescription>
            {t('inbox.failed.viewSource.description', { code: row.errorCode })}
          </DialogDescription>
        </DialogHeader>
        <ViewSourceBody row={row} t={t} />
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function ViewSourceBody({
  row,
  t,
}: {
  row: FailedRow;
  t: (key: string, opts?: Record<string, unknown>) => string;
}): ReactElement {
  if (row.ingestKind === 'screenshot') {
    return (
      <img
        src={`/api/food/ingest/source/${row.sourceId}/screenshot`}
        alt={t('inbox.failed.viewSource.screenshotAlt')}
        className="max-h-[60vh] w-full rounded border bg-muted object-contain"
      />
    );
  }
  if (row.ingestKind === 'text') {
    return (
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border bg-muted/40 p-3 text-sm">
        {t('inbox.failed.viewSource.textPlaceholder')}
      </pre>
    );
  }
  if (row.sourceUrl === null) {
    return <p className="text-sm text-muted-foreground">{t('inbox.failed.viewSource.noUrl')}</p>;
  }
  return (
    <div className="space-y-3">
      <a
        href={row.sourceUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-sm text-primary underline"
      >
        {row.sourceUrl}
      </a>
      <iframe
        src={row.sourceUrl}
        title={t('inbox.failed.viewSource.iframeTitle')}
        sandbox="allow-same-origin"
        // `no-referrer` so the external site can't see internal POPS URLs
        // like `/food/inbox/<id>` in its access logs.
        referrerPolicy="no-referrer"
        className="h-[50vh] w-full rounded border bg-background"
      />
    </div>
  );
}
