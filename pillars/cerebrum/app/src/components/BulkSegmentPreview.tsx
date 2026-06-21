/**
 * Inline preview shown above the submit button when the body contains
 * `---` separators (PRD-081 US-08). Lists detected segments so the user
 * can sanity-check before committing to a bulk capture.
 */
import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import type { BulkSegment } from '../pages/ingest-page/bulk-paste';

interface BulkSegmentPreviewProps {
  segments: BulkSegment[];
}

export function BulkSegmentPreview({ segments }: BulkSegmentPreviewProps) {
  const { t } = useTranslation('cerebrum');
  if (segments.length <= 1) return null;
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{segments.length}</Badge>
        <span>{t('ingest.bulkPreview.heading')}</span>
      </div>
      <ol className="text-sm text-foreground/80 space-y-1 list-decimal pl-5">
        {segments.map((seg) => (
          <li key={seg.index} className="font-mono text-xs truncate">
            {seg.preview}
          </li>
        ))}
      </ol>
    </div>
  );
}
