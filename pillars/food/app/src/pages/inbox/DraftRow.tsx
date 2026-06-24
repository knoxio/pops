/**
 * The kind chip stops row-click propagation: `url-*` kinds open the source
 * in a new tab, text / screenshot kinds open `ViewSourceDialog` inline.
 * The rest of the row navigates to the inspector at `/food/inbox/:sourceId`.
 */
import { type ReactElement, useState } from 'react';
import { Link } from 'react-router';

import { Badge } from '@pops/ui';

import { relativeTimeFrom, hasOpenableSourceUrl } from './inbox-types.js';
import { QualityBandBadge } from './QualityBandBadge.js';
import { ViewSourceDialog, type ViewSource } from './ViewSourceDialog.js';

import type { InboxListResponses } from '../../food-api/types.gen.js';

type InboxDraftRow = InboxListResponses[200]['items'][number];

interface Props {
  row: InboxDraftRow;
  /** Override "now" so tests can pin relative-time strings. */
  now?: Date;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function DraftRow({ row, now, t }: Props): ReactElement {
  const [previewOpen, setPreviewOpen] = useState(false);
  const title = row.title ?? t('inbox.drafts.row.noTitle');
  const ageNow = now ?? new Date();
  const ingestedAtIso =
    row.ingestedAt.replace(' ', 'T') + (row.ingestedAt.endsWith('Z') ? '' : 'Z');
  const age = relativeTimeFrom(ingestedAtIso, ageNow);
  return (
    <article
      className="group relative rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40"
      data-testid="draft-row"
      data-source-id={row.sourceId}
    >
      <Link
        to={`/food/inbox/${row.sourceId}`}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={t('inbox.drafts.row.openInspectorAria', { title })}
      />
      <div className="relative z-10 flex flex-wrap items-start gap-3">
        <QualityBandBadge
          band={row.qualityBand}
          topSignals={row.topSignals}
          bandLabel={t(`inbox.drafts.band.${row.qualityBand}`)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{title}</span>
            <KindChip row={row} t={t} onPreview={() => setPreviewOpen(true)} />
            <span
              className="text-xs text-muted-foreground"
              title={ingestedAtIso}
              data-testid="draft-row-age"
            >
              {age}
            </span>
          </div>
          <SubLine row={row} t={t} />
          {row.partialReason !== undefined && (
            <p
              className="mt-1 rounded-sm bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              role="note"
            >
              {t(`inbox.drafts.partialReason.${row.partialReason}`)}
            </p>
          )}
        </div>
      </div>
      <ViewSourceDialog
        row={previewOpen ? toViewSource(row) : null}
        onClose={() => setPreviewOpen(false)}
        t={t}
      />
    </article>
  );
}

function toViewSource(row: InboxDraftRow): ViewSource {
  return {
    sourceId: row.sourceId,
    ingestKind: row.ingestKind,
    sourceUrl: row.sourceUrl,
  };
}

function SubLine({
  row,
  t,
}: {
  row: InboxDraftRow;
  t: (key: string, opts?: Record<string, unknown>) => string;
}): ReactElement {
  const parts: string[] = [row.recipeSlug];
  if (row.proposedSlugCount > 0) {
    parts.push(t('inbox.drafts.row.proposedSlugs', { count: row.proposedSlugCount }));
  }
  if (row.creationCount > 0) {
    parts.push(t('inbox.drafts.row.creations', { count: row.creationCount }));
  }
  parts.push(t(`inbox.drafts.row.compileStatus.${row.compileStatus}`));
  return <p className="mt-0.5 truncate text-xs text-muted-foreground">{parts.join(' · ')}</p>;
}

function KindChip({
  row,
  t,
  onPreview,
}: {
  row: InboxDraftRow;
  t: (key: string) => string;
  onPreview: () => void;
}): ReactElement {
  const label = t(`inbox.ingestKind.${row.ingestKind}`);
  if (hasOpenableSourceUrl(row.ingestKind, row.sourceUrl)) {
    return (
      <a
        href={row.sourceUrl ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="relative z-20 inline-flex"
        data-testid="draft-row-kind-link"
      >
        <Badge variant="outline">{label}</Badge>
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onPreview();
      }}
      className="relative z-20 inline-flex"
      data-testid="draft-row-kind-preview"
    >
      <Badge variant="outline">{label}</Badge>
    </button>
  );
}
